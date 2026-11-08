# 一键部署（三段式 + 代码闸门）：git 同步检查 -> 拉取合并 -> build -> 发布 -> 回传内容快照 -> 验证
# 用法：npm run deploy    秒级回滚：npm run rollback
#
# 发布机制（第 4 步，「增量同步 + 发布原子化」）：
#   站点目录 /var/www/my-web 内建发布仓库 releases/<版本名>/，入口是 current symlink，
#   nginx root 指向 current（首次迁移需一次 sudo，此后永久生效，线上服务不中断）。
#   每次发布：本地上传 dist 包 + sha256 指纹清单 -> 服务器 cp -al 上一 release 硬链接打底
#   （未变更文件零拷贝），按清单 diff 只落变更文件、把删除文件挪去 releases/.trash 滞后清理，
#   最后 ln -sfn 原子切换 current —— 线上无开窗。保留最近 3 个 release，更旧自动回收。
#   __probe_current.txt 为位置探针：公网取到它 = nginx root 已切到 current，
#   deploy 会顺手清理顶层遗留的旧散置文件；未切换时线上仍由旧目录服务，脚本会提示一次性命令。
#   服务器端逻辑在 scripts/remote-publish.sh（deploy 每次随包上传后执行）。
#
# 内容同步策略（防多终端编辑丢稿）：
#   服务器上有独立内容目录 /home/ubuntu/blog-src（posts/ + showcases/ + site.json + post-order.json + showcase-order.json），
#   部署前先比对 mtime 把「服务器上比本机新/本机没有」的文件拉回本机构建，
#   构建完再把合并结果回传快照——服务器内容目录永远 = 最新已发布状态（兼作云端备份）。
#   冲突规则只有一条：mtime 新者胜（不搞三方合并）。
#   注意：文章内容走 mtime 同步，但**代码走 git**——deploy 前强制与 origin/main 对齐，
#   若本机落后则中止（防止旧代码构建覆盖另一终端已部署的新版本，有过教训）。
#
# 前提：私钥已加入 Windows ssh-agent（服务需为 Running，本机已设为开机自动）。
# 站点地址：feed.xml/sitemap.xml 的绝对链接用 SITE_URL（默认 funnel 公网址，可用环境变量覆盖）。
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# 目标可用环境变量覆盖，方便换机器部署
$target    = $env:DEPLOY_TARGET ; if (-not $target)    { $target    = 'ubuntu@100.66.247.91' }
$verifyUrl = $env:DEPLOY_URL    ; if (-not $verifyUrl) { $verifyUrl = 'https://ubuntu-server.tail0f5897.ts.net/' }
$remoteDir = '/var/www/my-web'          # nginx 站点目录（构建产物）
$remoteSrc = '/home/ubuntu/blog-src'    # 内容中转目录（md 源 + 数据 json，不在 nginx 下）

# feed/sitemap/robots 里的绝对地址（构建期 gen-feed.mjs 读取）
$env:SITE_URL = if ($env:SITE_URL) { $env:SITE_URL } else { 'https://ubuntu-server.tail0f5897.ts.net' }

$winSsh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$winScp = Join-Path $env:WINDIR 'System32\OpenSSH\scp.exe'
$winTar = Join-Path $env:WINDIR 'System32\tar.exe'
foreach ($tool in @($winSsh, $winScp, $winTar)) {
  if (-not (Test-Path $tool)) { throw "缺少工具：$tool" }
}

# ---------- 1/6 代码闸门：本机必须基于最新远程代码构建 ----------
Write-Host '[1/6] git sync guard...' -ForegroundColor Cyan
& git fetch origin
if ($LASTEXITCODE -ne 0) {
  # fetch 失败（网络问题）不中止部署，只提示——与服务器之间走内网 ssh 仍可能可用
  Write-Host '  warning: git fetch 失败，跳过落后检查（网络恢复后建议重新部署）' -ForegroundColor Yellow
}
else {
  $behind = (& git rev-list --count HEAD..origin/main) -as [int]
  if ($behind -gt 0) {
    throw "本机落后 origin/main $behind 个提交，已中止：旧代码构建会覆盖另一终端部署的新版本——先 git pull --rebase 再 deploy"
  }
  Write-Host '  local code is up to date with origin/main' -ForegroundColor DarkGray
}

# ---------- 2/6 拉取：服务器比本机新/本机没有的内容 ----------
Write-Host '[2/6] pulling content from server...' -ForegroundColor Cyan

# 远端清单：每行 "mtime_epoch 相对路径"（相对 remoteSrc，含目录以区分 posts/showcases）
$listing = & $winSsh -o BatchMode=yes $target ('cd {0} && for f in posts/*.md showcases/*.md site.json post-order.json showcase-order.json; do if [ -f "$f" ]; then echo "$(stat -c %Y "$f") $f"; fi; done' -f $remoteSrc)
if ($LASTEXITCODE -ne 0) { throw '读取服务器内容清单失败（检查 ssh-agent：ssh-add -l）' }

$pulled = 0
foreach ($line in ($listing -split "`n")) {
  $line = $line.Trim()
  if ($line -notmatch '^(\d+)\s+(\S+)$') { continue }
  $remoteTime = [long]$Matches[1]
  $name = $Matches[2]
  $relLocal = Join-Path 'src' ($name -replace '/', '\')
  $localPath = Join-Path $repoRoot $relLocal
  $remotePath = "$remoteSrc/$name"

  $needPull = $false
  if (-not (Test-Path $localPath)) {
    $needPull = $true    # 本机没有：其它终端生成的新内容
  }
  else {
    $fileTime = (Get-Item $localPath).LastWriteTimeUtc
    $localTime = ([DateTimeOffset]::new($fileTime.Ticks, [TimeSpan]::Zero)).ToUnixTimeSeconds()
    if ($remoteTime -gt $localTime) { $needPull = $true }   # 服务器更新：服务器端修改要保住
  }

  if ($needPull) {
    & $winScp -o BatchMode=yes -p "${target}:$remotePath" $localPath
    if ($LASTEXITCODE -ne 0) { throw "拉取 $name 失败" }
    Write-Host "  pulled: $name" -ForegroundColor DarkGray
    $pulled++
  }
}
if ($pulled -eq 0) { Write-Host '  nothing new on server' -ForegroundColor DarkGray }
else { Write-Host "  pulled $pulled file(s)" }

# ---------- 3/6 构建 ----------
Write-Host '[3/6] building...' -ForegroundColor Cyan
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'build 失败，部署中止' }
if (-not (Test-Path (Join-Path $repoRoot 'dist\index.html'))) { throw 'dist/index.html 不存在，部署中止' }

# ---------- 4/6 发布：增量同步 + 原子切换 ----------
Write-Host '[4/6] publishing (incremental + atomic switch)...' -ForegroundColor Cyan
$remotePub = '/tmp/my-web-publish.sh'
$pubScript = Join-Path $PSScriptRoot 'remote-publish.sh'

# 4.1 本地生成新构建指纹清单（与服务器 sha256sum 输出同格式：<hash>  ./相对路径）。
#     必须无 BOM + LF —— 服务器端 awk 按 $1/$2 逐字节 diff，BOM/CRLF 都会算错变更集。
$distRoot = Join-Path $repoRoot 'dist'
$entries = Get-ChildItem $distRoot -Recurse -File | ForEach-Object {
  $rel = './' + $_.FullName.Substring($distRoot.Length).Replace('\', '/').TrimStart('/')
  $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  [pscustomobject]@{ rel = $rel; hash = $hash }
}
$manifestText = (($entries | Sort-Object rel) | ForEach-Object { "$($_.hash)  $($_.rel)" }) -join [char]10
$manifestFile = Join-Path $env:TEMP 'my-web-manifest.txt'
[IO.File]::WriteAllText($manifestFile, $manifestText + [char]10, (New-Object System.Text.UTF8Encoding($false)))

# 4.2 打包 dist（~350KB 内网秒传；增量收敛在服务器端：硬链接复用未变更文件）
$bundle = Join-Path $env:TEMP 'my-web-dist.tgz'
& $winTar -C dist -czf $bundle .
if ($LASTEXITCODE -ne 0) { throw '本地打包失败' }

# 4.3 INIT MODE：站点目录还没有 releases/ 时做一次性迁移
$initCheck = & $winSsh -o BatchMode=yes $target "test -e $remoteDir/releases && echo INITED || echo FRESH"
if ($LASTEXITCODE -ne 0) { throw '探测发布仓库失败（检查 ssh-agent：ssh-add -l）' }
$initState = $initCheck | Out-String

if ($initState -match 'FRESH') {
  Write-Host '  INIT MODE: 首次迁移——dist 直传保持线上即时最新，再把现有目录拷入 releases/base' -ForegroundColor Yellow
  & $winScp -o BatchMode=yes $bundle "${target}:/tmp/my-web-dist.tgz"
  if ($LASTEXITCODE -ne 0) { throw 'INIT scp 上传失败（检查 ssh-agent：ssh-add -l）' }
  & $winSsh -o BatchMode=yes $target "tar -xzf /tmp/my-web-dist.tgz -C $remoteDir && rm -f /tmp/my-web-dist.tgz"
  if ($LASTEXITCODE -ne 0) { throw 'INIT 远端解压失败' }
  & $winScp -o BatchMode=yes $pubScript "${target}:$remotePub"
  if ($LASTEXITCODE -ne 0) { throw 'INIT 上传发布脚本失败' }
  $initOut = (& $winSsh -o BatchMode=yes $target "bash $remotePub init $remoteDir") | Out-String
  if ($initOut -notmatch 'INIT_OK') { throw "INIT 迁移失败：$initOut" }
  Write-Host @'
  发布仓库已建立：releases/base + current symlink。

  一次性动作（在你自己的终端执行；nginx root 切到 current 后，下次部署自动清理顶层遗留文件）：
    1) 定位配置：sudo grep -rln "root /var/www/my-web;" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null
    2) 切 root： sudo sed -i "s#root /var/www/my-web;#root /var/www/my-web/current;#" <第1步找到的文件>
    3) 生效：    sudo nginx -t && sudo systemctl reload nginx

  切换完成前线上仍由旧目录服务（不受影响）。
'@ -ForegroundColor Yellow
}
else {
  # 4.4 常规发布：上传 dist 包 + 指纹清单 -> 服务器硬链接增量 + 滞后删除 + 原子切换
  & $winScp -o BatchMode=yes $bundle "${target}:/tmp/my-web-dist.tgz"
  if ($LASTEXITCODE -ne 0) { throw 'scp 上传 dist 失败（检查 ssh-agent：ssh-add -l）' }
  & $winScp -o BatchMode=yes $manifestFile "${target}:/tmp/my-web-manifest.txt"
  if ($LASTEXITCODE -ne 0) { throw 'scp 上传指纹清单失败' }
  & $winScp -o BatchMode=yes $pubScript "${target}:$remotePub"
  if ($LASTEXITCODE -ne 0) { throw 'scp 上传发布脚本失败' }
  $relName = 'r' + (Get-Date -Format 'yyyyMMdd-HHmmss')
  $pubOut = (& $winSsh -o BatchMode=yes $target "bash $remotePub publish $remoteDir $relName") | Out-String
  if ($pubOut -match 'NOTHING_CHANGED') {
    Write-Host '  构建与线上 release 完全一致，未创建新 release' -ForegroundColor DarkGray
  }
  elseif ($pubOut -match 'PUBLISH_OK') {
    Write-Host "  released: releases/$relName（current 已原子切换）" -ForegroundColor DarkGray
  }
  else { throw "远端发布失败：$pubOut" }
}

Remove-Item $bundle, $manifestFile -Force -ErrorAction SilentlyContinue

# 4.5 位置探针：从服务器本机回环 curl 探针文件并**精确匹配内容 ok**。
#     两层防误判：走服务器回环（不经 funnel/本地代理）；nginx 配了 SPA fallback
#     （404 全部回退成 200 的 index.html，首版按状态码探针曾因此误命中），回退内容不是 'ok'。
$probeState = & $winSsh -o BatchMode=yes $target 'if [ "$(curl -s http://127.0.0.1/__probe_current.txt)" = "ok" ]; then echo PROBE_OK; else echo PROBE_MISS; fi'
if ($LASTEXITCODE -ne 0) { throw '位置探针命令执行失败' }

if (($probeState | Out-String) -match 'PROBE_OK') {
  # 顺手回收顶层遗留文件（releases/ 与 current 之外都不再需要）
  & $winSsh -o BatchMode=yes $target "cd $remoteDir && find . -mindepth 1 -maxdepth 1 ! -name releases ! -name current -print0 | xargs -0 -r rm -rf --"
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  warning: 清理顶层遗留文件失败（不影响发布，下次重试）' -ForegroundColor Yellow
  }
  else {
    Write-Host '  probe ok: nginx root 已指向 current，顶层遗留文件已清理' -ForegroundColor DarkGray
  }
}
else {
  Write-Host @'
  warning: 位置探针未命中 —— nginx root 仍是旧目录 /var/www/my-web，线上读的是旧目录内容。
  请完成一次性 root 切换（命令见上方 INIT 提示或 README 部署节），之后每次部署会自动清理并校准。
'@ -ForegroundColor Yellow
}

# ---------- 5/6 回传内容快照（服务器 = 云端备份） ----------
Write-Host '[5/6] pushing content snapshot...' -ForegroundColor Cyan
$srcBundle = Join-Path $env:TEMP 'my-web-src.tgz'
& $winTar -C src -czf $srcBundle posts showcases site.json post-order.json showcase-order.json
if ($LASTEXITCODE -ne 0) { throw '内容打包失败' }
& $winScp -o BatchMode=yes $srcBundle "${target}:/tmp/my-web-src.tgz"
if ($LASTEXITCODE -ne 0) { throw '内容上传失败' }
& $winSsh -o BatchMode=yes $target "mkdir -p $remoteSrc && rm -rf $remoteSrc/posts $remoteSrc/showcases && tar -xzf /tmp/my-web-src.tgz -C $remoteSrc && rm -f /tmp/my-web-src.tgz && echo SNAPSHOT_OK"
if ($LASTEXITCODE -ne 0) { throw '内容快照写入失败' }
Remove-Item $srcBundle -Force -ErrorAction SilentlyContinue

# ---------- 6/6 验证 ----------
Write-Host '[6/6] verifying...' -ForegroundColor Cyan
$resp = Invoke-WebRequest -Uri $verifyUrl -UseBasicParsing -TimeoutSec 20
if ($resp.StatusCode -ne 200) { throw "部署后验证失败：HTTP $($resp.StatusCode)" }
$feed = Invoke-WebRequest -Uri ($verifyUrl.TrimEnd('/') + '/feed.xml') -UseBasicParsing -TimeoutSec 20
if ($feed.StatusCode -ne 200) { throw "feed 验证失败：HTTP $($feed.StatusCode)" }
Write-Host "部署完成并通过验证：$verifyUrl (HTTP $($resp.StatusCode), feed HTTP $($feed.StatusCode))" -ForegroundColor Green
