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
- `src/posts.ts` 对同一份 md 做**两次 glob**：一次编译成组件（渲染）、一次 `?raw` 取原文（手工解析 frontmatter）。改数据层时要两边同步。项目案例集 `src/showcases.ts` + `src/showcases/*.md` 同款两份 glob（共享解析层在 `src/markdown-meta.ts`），改共享解析规则同样要考虑三处同步约定。
- Shiki 插件工厂返回 Promise，`vite.config.ts` 里必须 `md.use(await markdownItShiki(...))`——同步调用会直接坏掉。`defaultColor: false` 才有双主题 CSS 变量。
- `unplugin-vue-markdown` v32 内部用的是 `markdown-exit`（fork），不是 markdown-it；相关依赖版本（vue-router 5 / vite 8 / markdown-it 15）都比较新，查文档时注意版本。
- `scripts/admin.mjs`（管理面板）有自己独立的 frontmatter 生成/解析实现；`scripts/gen-feed.mjs`（构建期生成 feed.xml/sitemap.xml，挂在 `npm run build` 末尾）也有第三份极简解析（只认字符串键 title/date/summary/source/draft）——**改 frontmatter 规则时三处同步**（新增键、调整数组语法）。站点信息的数据源是 `src/site.json`。
- 草稿机制：frontmatter `draft: true` 的文章在站点侧（列表/路由/feed/sitemap）全部隐藏，面板里显示「草稿」标记并可编辑。**但草稿正文仍会编译进构建产物的 JS bundle**（glob 无法按内容过滤）——别把敏感内容写成draft，介意的话写完立刻删除文件。
- 手动排序数据源是 `src/post-order.json`（slug 数组）：站点侧 `src/posts.ts` 与面板 `listPosts()` 各有一份「清单优先、其余日期倒序」的排序实现，**改排序规则也要两边同步**。改 `scripts/admin.mjs` 后必须重启面板进程（Node 不热载）。
- 部署（`scripts/deploy.ps1`）是六步：**0.git 闸门 → ①拉取合并 → ②build → ③双推送（dist + 内容快照）→ ④验证**。**git 闸门**：先 `git fetch`，若本机落后 `origin/main` 直接中止（防止旧代码构建覆盖另一终端已部署的新版本——发生过：在未合并 showcase 提交的副本上 deploy，线上项目页被抹掉）。文章内容走 mtime 同步不动，代码版本必须走 git。服务器有内容中转目录 `/home/ubuntu/blog-src`（posts/ + site.json + post-order.json，nginx 站点目录之外），拉取规则只有一条：**mtime 新者胜**（服务器更新或本机没有的文件拉回本机，防多终端编辑丢稿；不搞三方合并）。构建完把合并结果回传快照，服务器内容目录永远 = 最新已发布状态（兼作云端备份）。`SITE_URL` 默认 `https://ubuntu-server.tail0f5897.ts.net`（gen-feed.mjs 读取，可用环境变量覆盖），feed/sitemap/robots 的绝对链接用它。
- 部署走 Windows 自带 OpenSSH + 私钥在 `ssh-agent` 里（服务开机自动）；密钥带 passphrase，丢 agent 后脚本会失败，重新 `ssh-add` 即可。服务器 sudo 每连接需密码（不交互不走 sudo）；**Windows PowerShell 5.1 的原生命令管道会损坏二进制流，不能用 `tar | ssh` 传 gzip，必须「打包成文件 -> scp -> 远端解压」**；PS 5.1 读无 BOM 的 UTF-8 .ps1 会按 ANSI 解析，脚本含中文须带 BOM 保存。
- 公网发布靠 `tailscale funnel`（**已配置为后台常驻，重启自动恢复，无需人工干预**）：服务器执行过 `tailscale set --operator=ubuntu`（免 sudo）+ `tailscale funnel --bg --yes 80`（配置落盘 tailscaled，重启存活已验证）。**flag 必须放在位置参数前**（`funnel --bg --yes 80`，写成 `funnel 80 --bg` 会报 invalid argument format）。关闭：`tailscale funnel --https=443 off`；查看：`tailscale funnel status`。注意：开启时会杀掉遗留的前台 `tailscale funnel 80` 终端进程（属预期）。站点同时可走 tailnet `http://100.66.247.91/`（nginx 监听不变）。
- 服务器 nginx 配置非发行版默认（压测后手工调优，**nginx 配置不在仓库、未纳入 deploy 脚本**，改要在服务器上手工做）：`listen 80 default_server backlog=8192`（发行版默认 511）、`worker_connections 8192` + 主上下文 `worker_rlimit_nofile 8192`（Ubuntu 26.04 默认均 768）。压测：服务器装了 wrk/ab；**wrk 须 `ulimit -n 65535` 才能真开 5000 连接**，ab 在 ≥5000 并发时自身统计失真（ connect 3983 / 7 万"失败"均为工具自身的锅，非服务器）。实测 5000 并发 22k req/s 全 0 错误。
- 代码块配色靠 `.markdown-body pre` 双主题变量映射实现：Shiki 配 `defaultColor: false`（只输出 `--shiki-light`/`--shiki-dark` CSS 变量、不发真实 color），所以 main.css 里必须有「浅色 `color: var(--shiki-light)` + 深色 `.dark` 下 `!important` 映射 `--shiki-dark`」两条规则，删掉任何一边浅色/深色对应模式代码就会失去语法配色。搬站/重构样式时别丢。

## 路由与主题

- `/blog/:slug` 路由**必须 `props: true`**（去掉过，直达/刷新文章页就 404，已修回）。
- 深色模式 = `html.dark` class + `main.css` 里的 CSS 变量（`:root` / `.dark` 两套 token）。`index.html` 里有防闪烁内联脚本，读 `localStorage` 的 key 固定为 `theme`（`auto|light|dark`）。
- 个人信息/联系方式的**数据源是 `src/site.json`**（管理面板 `npm run admin` 可图形化编辑），`src/site.ts` 只做类型导出；别在页面组件里散写信息。

## 环境与 git

- **`src/posts/*.md`（文章）不入 git**（用户要求：仓库只放代码）。文章只存在于本地，`git status` 看不到它们属正常；换克隆环境会失去全部文章，部署类任务前先确认。
- 写作规范（贴图、链接、转载）已沉淀在 `docs/images.md` 和 `docs/links.md`，写文章相关任务先读这两份。

- 推 GitHub（HTTPS）经常被网络重置 `Connection was reset`，**多重试几次通常能通**；本仓库 git identity 是本地配置的 `haoge-works@users.noreply.github.com`，`core.sshCommand` 指向 `D:\Git\usr\bin\ssh.exe`（Windows 自带 ssh 太旧，连不上 `ssh.github.com:443` 的新 KEX）。
- 部署子路径时改 `vite.config.ts` 的 `base`（现在为 `'/'`）；路由用了 `import.meta.env.BASE_URL`。
- 无 CI、无测试框架、单包仓库（非 monorepo）。
