#!/usr/bin/env bash
# my-web 服务器端发布助手（由 scripts/deploy.ps1 / scripts/rollback.ps1 经 ssh 调用）
# 模式：
#   init <site_dir>              首次迁移：现有 live 目录（须已解压最新 dist）拷成 releases/base，
#                                建 .manifest + 探针文件 + current symlink
#   publish <site_dir> <name>    日常发布：cp -al 上一 release 硬链接打底 -> 按清单 diff 只落变更文件
#                                （/tmp/my-web-dist.tgz + /tmp/my-web-manifest.txt）-> 删除集挪 releases/.trash
#                                滞后清理 -> ln -sfn 原子切换 current -> 只保留最近 3 个 release
#   rollback <site_dir>          current 指回上一 release（按版本名倒序的下一个）
# __probe_current.txt 为位置探针：nginx root 指向 current 时公网可取到（deploy.py 据此清顶层遗留文件）。
# 指纹清单与 sha256sum 输出同格式（<hash>  <./相对路径>），无 BOM、LF 行尾——awk 按 $1/$2 逐字节比对。

set -eu

cmd="${1:?usage: remote-publish.sh init|publish|rollback <site_dir> [name]}"
SITE="${2:?missing site dir}"
REL="$SITE/releases"
TRASH="$REL/.trash"
PROBE='__probe_current.txt'
TGZ=/tmp/my-web-dist.tgz
NEWMAN=/tmp/my-web-manifest.txt

# 目录 -> 指纹清单（排除清单文件与探针本身，避免自引用）
gen_manifest() {
  (cd "$1" && find . -type f ! -name .manifest ! -name "$PROBE" -print0 \
    | sort -z | xargs -0 -r sha256sum)
}

case "$cmd" in

  init)
    if [ -e "$REL" ]; then echo 'ALREADY_INIT'; exit 0; fi
    # 先拷贝（此时 releases/ 尚不存在，无需排除），拷完再改名挪进 releases/base
    rm -rf "$SITE"/.base-move.* 2>/dev/null || true
    BASETMP="$SITE/.base-move.$$"
    mkdir "$BASETMP"
    # 排除自己的中转目录，防止空目录被拷进 base；三重保险排除发布机制自身
    tar -C "$SITE" -cf - --exclude='./.base-move.*' --exclude='./releases' --exclude='./current' . \
      | tar -C "$BASETMP" -xf -
    gen_manifest "$BASETMP" > "$BASETMP/.manifest"
    mkdir -p "$REL"
    mv "$BASETMP" "$REL/base"
    echo ok > "$REL/base/$PROBE"
    ln -sfn releases/base "$SITE/current"
    echo 'INIT_OK'
    ;;

  publish)
    NAME="${3:?publish 需要版本名}"
    [ -e "$REL" ] || { echo 'NOT_INIT'; exit 2; }
    CUR="$(readlink "$SITE/current")" || { echo 'ERR_NO_CURRENT'; exit 1; }
    PREV="$SITE/$CUR"
    [ -d "$PREV" ] || { echo "ERR: current 指向不存在的目录：$CUR"; exit 1; }
    # 旧 release 若缺清单（理论上只在手工干扰后出现），现场补一份再 diff
    OLD_MAN="$PREV/.manifest"
    [ -f "$OLD_MAN" ] || { gen_manifest "$PREV" > "$OLD_MAN"; }

    WORK="$(mktemp -d "$REL/.work-XXXXXX")"
    mkdir "$WORK/stage"
    tar -xzf "$TGZ" -C "$WORK/stage"

    # 变更集：NEW 里 hash 与 OLD 不同（含新增）；删除集：OLD 有而 NEW 无
    awk 'NR==FNR{h[$2]=$1; next} h[$2]!=$1{print $2}' "$OLD_MAN" "$NEWMAN" > "$WORK/chg.lst"
    awk 'NR==FNR{h[$2]=$1; next} !($2 in h){print $2}' "$NEWMAN" "$OLD_MAN" > "$WORK/del.lst"

    # 完整性自检：每个“变更”文件必须真实存在于上传包里（防清单与包不一致）
    deps=0
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      [ -f "$WORK/stage/$f" ] || { echo "MISSING_IN_STAGE: $f"; deps=1; }
    done < "$WORK/chg.lst"
    if [ "$deps" -ne 0 ]; then echo 'ERR_CHANGED_FILES'; exit 3; fi

    if [ ! -s "$WORK/chg.lst" ] && [ ! -s "$WORK/del.lst" ]; then
      rm -f "$TGZ" "$NEWMAN"
      rm -rf "$WORK"
      echo 'NOTHING_CHANGED'
      exit 0
    fi

    if [ -e "$REL/$NAME" ]; then echo 'ERR_RELEASE_EXISTS'; exit 3; fi
    NEW="$REL/$NAME"
    mkdir "$NEW"

    # 硬链接打底：未变更文件与上一 release 共享 inode（零拷贝）
    cp -al "$PREV/." "$NEW/"
    # 只落变更文件：先 rm 断开共享 inode，再 mv 新文件，绝不写穿旧 release
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      rm -f "$NEW/$f"
      mkdir -p "$NEW/$(dirname "$f")"
      mv "$WORK/stage/$f" "$NEW/$f"
    done < "$WORK/chg.lst"

    # 删除集挪进 .trash：延迟真实回收，在途访客由旧 release 的硬链接保护；7 天后清空。
    # 若同名 trash 遗留（跨 release 重复删除同一文件，其 inode 与源同为硬链接），
    # mv 会被 GNU 判为同文件拒绝——先断开旧链接再挪。
    if [ -s "$WORK/del.lst" ]; then
      mkdir -p "$TRASH"
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        dst="$TRASH/$(echo "${f#./}" | tr / _)"
        rm -f "$dst"
        mv "$NEW/$f" "$dst"
      done < "$WORK/del.lst"
    fi

    # 新 release 自带清单与探针（同样先断链再写，避免 cp 内容到共享 inode）
    rm -f "$NEW/.manifest"
    cp "$NEWMAN" "$NEW/.manifest"
    rm -f "$NEW/$PROBE"
    echo ok > "$NEW/$PROBE"

    # 原子切换入口：ln -sfn 一步替换，无中间状态
    ln -sfn "releases/$NAME" "$SITE/current"

    rm -f "$TGZ" "$NEWMAN"
    rm -rf "$WORK"
    find "$TRASH" -type f -mtime +7 -delete 2>/dev/null || true
    # 只保留最近 3 个 release（隐藏目录 .trash/.work 不参与，current 恒指最新所以安全）
    (cd "$REL" && ls -1d */ 2>/dev/null | sed 's:/$::' | sort -r | tail -n +4 \
      | while IFS= read -r old; do rm -rf "$REL/$old"; done)
    echo "PUBLISH_OK $NAME"
    ;;

  rollback)
    [ -e "$REL" ] || { echo 'NO_RELEASES'; exit 1; }
    cur="$(readlink "$SITE/current" 2>/dev/null | sed 's#releases/##')"
    if [ -z "$cur" ]; then echo 'ERR_NO_CURRENT'; exit 1; fi
    mapfile -t rels < <(cd "$REL" && ls -1d */ base 2>/dev/null | sed 's:/$::' | sort -r)
    idx=-1
    for i in "${!rels[@]}"; do
      if [ "${rels[$i]}" = "$cur" ]; then idx=$i; fi
    done
    if [ "$idx" -lt 0 ]; then echo "ERR: current($cur) 不在版本清单里"; exit 1; fi
    nxt=$((idx+1))
    if [ "$nxt" -ge "${#rels[@]}" ]; then echo "ALREADY_OLDEST $cur"; exit 0; fi
    dst="${rels[$nxt]}"
    [ -d "$REL/$dst" ] || { echo "ERR: 目标 release 缺失：$dst"; exit 1; }
    ln -sfn "releases/$dst" "$SITE/current"
    echo "ROLLBACK_OK $cur -> $dst"
    ;;

  *)
    echo "usage: remote-publish.sh init|publish|rollback <site_dir> [name]" >&2
    exit 64
    ;;
esac
