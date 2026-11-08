# AGENTS.md

## 命令

```bash
npm run dev        # 开发服务器 http://localhost:5173
npm run admin      # 管理面板：127.0.0.1 + 自动探测的 Tailscale 地址（可用 ADMIN_HOSTS 覆盖），端口 5174
npm run build      # 构建 -> dist/（纯静态）
npm run deploy     # 三段式部署：拉取服务器内容 -> build -> 双推送（dist + 内容快照），公网 https://ubuntu-server.tail0f5897.ts.net/
npm run typecheck  # vue-tsc --noEmit（这是唯一的质量闸门：没有测试和 lint）
npm run preview
```

验证改动时先 `typecheck` 再 `build`；`tsconfig` 开了 `noUnusedLocals`，`<script setup>` 里解构了但没用的变量会报 TS6133（有过先例）。

## 博客流水线（最容易踩坑的地方）

- 文章 = `src/posts/*.md`，**文件名即 slug**（URL `/blog/<slug>`）。frontmatter 键：`title` / `date` / `tags`（`[a, b]` 列表）/ `summary` / `source`（转载原文 URL，写了文章页自动显示转载标注）。列表按日期倒序，日期写错会打乱排序。
- 正文**不要再写与 frontmatter title 相同的 `#` 一级标题**——文章页已渲染 `<h1>`，重复了只能删 md 里的。
- **新增 md 文件不会热更新**，必须手动刷新浏览器；已有文件内容改动会热更新。
- `src/posts.ts` 对同一份 md 做**两次 glob**：一次编译成组件（渲染）、一次 `?raw` 取原文（手工解析 frontmatter）。改数据层时要两边同步。项目案例集 `src/showcases.ts` + `src/showcases/*.md` 同款两份 glob（共享解析层在 `src/markdown-meta.ts`），改共享解析规则同样要考虑三处同步约定。frontmatter `updated`（最后修订日期）也在这层：**面板 PUT 保存文章时自动维护**（存在实际改动才写当天，`scripts/admin.mjs` 的 `resolveUpdated()`），posts/showcases 端只读不写，手工改 md 也可自行写该键。
- Shiki 插件工厂返回 Promise，`vite.config.ts` 里必须 `md.use(await markdownItShiki(...))`——同步调用会直接坏掉。`defaultColor: false` 才有双主题 CSS 变量。
- `unplugin-vue-markdown` v32 内部用的是 `markdown-exit`（fork），不是 markdown-it；相关依赖版本（vue-router 5 / vite 8 / markdown-it 15）都比较新，查文档时注意版本。
- `scripts/admin.mjs`（管理面板）有自己独立的 frontmatter 生成/解析实现，管理**两个集合**：文章（`/api/posts`，含 draft/转载 source/手动排序/自动 updated 修订时间）与项目 showcases（`/api/showcases`，多一个 repo 字段，无 draft，手动排序走 `/api/showcase-order` + `src/showcase-order.json`）；`scripts/gen-feed.mjs`（构建期生成 feed.xml/sitemap.xml/robots.txt/**search-index.json 站内搜索索引**，挂在 `npm run build` 末尾）也有第三份极简解析（认字符串键 title/date/summary/source/repo/updated/draft + tags 数组，posts+showcases 两目录都读，sitemap 收录 /projects 与 /tags 页）——**改 frontmatter 规则时三处同步**（新增键、调整数组语法）。索引从正文抽纯文本（去 frontmatter/代码块/markdown 标记，截断 3000 字符）并排除 draft；改 `src/posts.ts` 同样要把 index 用到的 tags 数组语法保持一致。站点信息的数据源是 `src/site.json`。
- 草稿机制：frontmatter `draft: true` 的文章在站点侧（列表/路由/feed/sitemap）全部隐藏，面板里显示「草稿」标记并可编辑。**但草稿正文仍会编译进构建产物的 JS bundle**（glob 无法按内容过滤）——别把敏感内容写成draft，介意的话写完立刻删除文件。
- 手动排序数据源是 `src/post-order.json`（文章 slug 数组）与 `src/showcase-order.json`（项目案例 slug 数组，**面板项目区 ▲▼ 维护**）：站点侧 `src/posts.ts`、`src/projects.ts`（以卡片 `case` slug 对齐清单，影响 /projects 页与首页项目区）与面板 `listPosts()`/`listShowcases()` 各有「清单优先、其余按原相对顺序（日期倒序）」的排序实现，**改排序规则也要两边同步**。改 `scripts/admin.mjs` 后必须重启面板进程（Node 不热载）。
- 部署（`scripts/deploy.ps1`，服务器端逻辑在 `scripts/remote-publish.sh`，deploy 每次随包上传后执行）是六步：**0.git 闸门 → ①拉取合并 → ②build → ③发布（增量 + 原子切换）→ ④内容快照 → ⑤验证**。**git 闸门**：先 `git fetch`，若本机落后 `origin/main` 直接中止（防止旧代码构建覆盖另一终端已部署的新版本——发生过：在未合并 showcase 提交的副本上 deploy，线上项目页被抹掉）；fetch 本身失败只警告不拦截。文章内容走 mtime 同步不动，代码版本必须走 git。服务器有内容中转目录 `/home/ubuntu/blog-src`（posts/ + **showcases/** + site.json + post-order.json + showcase-order.json，nginx 站点目录之外，与面板管理的两个集合一一对应），拉取规则只有一条：**mtime 新者胜**（服务器更新或本机没有的文件拉回本机，防多终端编辑丢稿；不搞三方合并）。构建完把合并结果回传快照，服务器内容目录永远 = 最新已发布状态（兼作云端备份）。`SITE_URL` 默认 `https://ubuntu-server.tail0f5897.ts.net`（gen-feed.mjs 读取，可用环境变量覆盖），feed/sitemap/robots 的绝对链接用它。
- **发布机制（第③步）**：站点目录内是发布仓库 `/var/www/my-web/releases/<版本名>/`，入口 `current` symlink，**nginx root 指向 current**。每次发布：本地发 dist 包 + sha256 指纹清单 → 服务器 `cp -al` 上一 release 硬链接打底（未变更文件零拷贝）→ 按清单 diff 只落变更文件 → 删除集挪 `releases/.trash` 滞后 7 天清理 → `ln -sfn` 原子切换（线上无开窗）→ 保留最近 3 个 release。**首次部署为 INIT 迁移**（dist 先直传旧目录保线上最新，再拷入 `releases/base`），需用户一次性 `sudo` 把 nginx root 切到 `/var/www/my-web/current`；位置探针 `__probe_current.txt` 公网命中后，下次 deploy 自动清理顶层遗留文件。指纹清单必须无 BOM + LF（服务器 awk 逐字节 diff）。`npm run rollback`（`scripts/rollback.ps1`）把 current 指回上一 release，秒级，可连续回滚。**两条实战教训**：① nginx 配了 SPA fallback（404 全部回退成 200 的 index.html）——任何「按状态码探测」都不可靠，探测类逻辑必须校验**响应内容**且尽量走服务器回环 curl（不经 funnel/本地代理）；② 跨 release 重复删除同一文件时，trash 里旧副本与源是同一 inode 的硬链接，GNU `mv` 会报 "same file" 拒绝——trash 落位前必须先 `rm` 旧链接。
- 部署走 Windows 自带 OpenSSH + 私钥在 `ssh-agent` 里（服务开机自动）；密钥带 passphrase，丢 agent 后脚本会失败，重新 `ssh-add` 即可。服务器 sudo 每连接需密码（不交互不走 sudo）；**Windows PowerShell 5.1 的原生命令管道会损坏二进制流，不能用 `tar | ssh` 传 gzip，必须「打包成文件 -> scp -> 远端解压」**；PS 5.1 读无 BOM 的 UTF-8 .ps1 会按 ANSI 解析，脚本含中文须带 BOM 保存。
- 公网发布靠 `tailscale funnel`（**已配置为后台常驻，重启自动恢复，无需人工干预**）：服务器执行过 `tailscale set --operator=ubuntu`（免 sudo）+ `tailscale funnel --bg --yes 80`（配置落盘 tailscaled，重启存活已验证）。**flag 必须放在位置参数前**（`funnel --bg --yes 80`，写成 `funnel 80 --bg` 会报 invalid argument format）。关闭：`tailscale funnel --https=443 off`；查看：`tailscale funnel status`。注意：开启时会杀掉遗留的前台 `tailscale funnel 80` 终端进程（属预期）。站点同时可走 tailnet `http://100.66.247.91/`（nginx 监听不变）。
- 服务器 nginx 配置非发行版默认（压测后手工调优，**nginx 配置不在仓库、未纳入 deploy 脚本**，改要在服务器上手工做）：`listen 80 default_server backlog=8192`（发行版默认 511）、`worker_connections 8192` + 主上下文 `worker_rlimit_nofile 8192`（Ubuntu 26.04 默认均 768）。压测：服务器装了 wrk/ab；**wrk 须 `ulimit -n 65535` 才能真开 5000 连接**，ab 在 ≥5000 并发时自身统计失真（ connect 3983 / 7 万"失败"均为工具自身的锅，非服务器）。实测 5000 并发 22k req/s 全 0 错误。
- 代码块配色靠 `.markdown-body pre` 双主题变量映射实现：Shiki 配 `defaultColor: false`（只输出 `--shiki-light`/`--shiki-dark` CSS 变量、不发真实 color），所以 main.css 里必须有「浅色 `color: var(--shiki-light)` + 深色 `.dark` 下 `!important` 映射 `--shiki-dark`」两条规则，删掉任何一边浅色/深色对应模式代码就会失去语法配色。搬站/重构样式时别丢。

## 路由与主题

- `/blog/:slug` 路由**必须 `props: true`**（去掉过，直达/刷新文章页就 404，已修回）。
- 深色模式 = `html.dark` class + `main.css` 里的 CSS 变量（`:root` / `.dark` 两套 token）。`index.html` 里有防闪烁内联脚本，读 `localStorage` 的 key 固定为 `theme`（`auto|light|dark`）。
- 个人信息/联系方式的**数据源是 `src/site.json`**（管理面板 `npm run admin` 可图形化编辑），`src/site.ts` 只做类型导出；别在页面组件里散写信息。

- 站内搜索 / 相关推荐 / 评论区：
  - `SearchModal.vue`（挂在 `App.vue`）收到 `window` 的 `site:search` 事件或全局 **Ctrl/⌘+K** 唤起（头部「搜索」按钮就是派发这个事件，两者松耦合）；索引 `dist/search-index.json` 由 gen-feed 构建后写 dist，**不放 `public/`**（避免重复拷贝），首次打开才 fetch，拉取失败退化为标题/摘要/标签搜索。
  - `src/related.ts` 的 `findRelated()`（tags 交集数排序、日期 tie-break、默认取 3）被 `PostPage.vue` 与 `ProjectCasePage.vue` 共用，无交集时区块自动隐藏。
  - `GiscusComment.vue` 评论依赖：仓库公开 + Discussions 开启 + **giscus GitHub App 已安装到仓库**；repoId/categoryId 等配置硬编码在组件里（改配置需重走 https://giscus.app/zh-CN 向导），mapping=pathname、theme 跟随站内深浅模式。
  - 长文扩展（lightbox 等）：`useMarkdownBody.ts` 是文章页/案例页共用的正文增强层（TOC/复制按钮/**图片点击放大 lightbox**——给正文 img 挂 click，全局覆盖层 `body > .img-lightbox` 单例、Esc/点击关闭、unmount 清理），两个页面共用一份 `contentBody` ref；**给文章贴了图即自动生效，无需额外配置**。
  - 标签聚合页 `TagsPage.vue`（路由 `/tags`，导航「标签」）：`posts.ts` 之外的纯派生视图（按标签归组、篇文章数排序），标签标题链接回 `/blog?tag=xxx` 过滤列表。

- 后台服务（`npm run admin` / `npm run dev`）**agent 不驻留**：只在验证需要时临时启动，任务结束立即按端口（5174/5173）杀进程收尾；需要时由用户自己激活。改 `scripts/admin.mjs` 后的重启同理，由用户自己完成。

## 环境与 git

- **`src/posts/*.md`（文章）不入 git**（用户要求：仓库只放代码）。文章只存在于本地，`git status` 看不到它们属正常；换克隆环境会失去全部文章，部署类任务前先确认。
- 写作规范（贴图、链接、转载）已沉淀在 `docs/images.md` 和 `docs/links.md`，写文章相关任务先读这两份。

- 推 GitHub（HTTPS）经常被网络重置 `Connection was reset`，**多重试几次通常能通**；本仓库 git identity 是本地配置的 `haoge-works@users.noreply.github.com`，`core.sshCommand` 指向 `D:\Git\usr\bin\ssh.exe`（Windows 自带 ssh 太旧，连不上 `ssh.github.com:443` 的新 KEX）。
- 部署子路径时改 `vite.config.ts` 的 `base`（现在为 `'/'`）；路由用了 `import.meta.env.BASE_URL`。
- 无 CI、无测试框架、单包仓库（非 monorepo）。
