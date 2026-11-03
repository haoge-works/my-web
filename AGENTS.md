# AGENTS.md

## 命令

```bash
npm run dev        # 开发服务器 http://localhost:5173
npm run admin      # 本地管理面板 http://127.0.0.1:5174（仅 127.0.0.1，Node 原生 http 零依赖）
npm run build      # 构建 -> dist/（纯静态）
npm run typecheck  # vue-tsc --noEmit（这是唯一的质量闸门：没有测试和 lint）
npm run preview
```

验证改动时先 `typecheck` 再 `build`；`tsconfig` 开了 `noUnusedLocals`，`<script setup>` 里解构了但没用的变量会报 TS6133（有过先例）。

## 博客流水线（最容易踩坑的地方）

- 文章 = `src/posts/*.md`，**文件名即 slug**（URL `/blog/<slug>`）。frontmatter 键：`title` / `date` / `tags`（`[a, b]` 列表）/ `summary` / `source`（转载原文 URL，写了文章页自动显示转载标注）。列表按日期倒序，日期写错会打乱排序。
- 正文**不要再写与 frontmatter title 相同的 `#` 一级标题**——文章页已渲染 `<h1>`，重复了只能删 md 里的。
- **新增 md 文件不会热更新**，必须手动刷新浏览器；已有文件内容改动会热更新。
- `src/posts.ts` 对同一份 md 做**两次 glob**：一次编译成组件（渲染）、一次 `?raw` 取原文（手工解析 frontmatter）。改数据层时要两边同步。
- Shiki 插件工厂返回 Promise，`vite.config.ts` 里必须 `md.use(await markdownItShiki(...))`——同步调用会直接坏掉。`defaultColor: false` 才有双主题 CSS 变量。
- `unplugin-vue-markdown` v32 内部用的是 `markdown-exit`（fork），不是 markdown-it；相关依赖版本（vue-router 5 / vite 8 / markdown-it 15）都比较新，查文档时注意版本。
- `scripts/admin.mjs`（管理面板）有自己独立的 frontmatter 生成/解析实现——**改 `src/posts.ts` 的解析规则时必须两边同步**（比如新增 frontmatter 键、调整数组语法）。站点信息的数据源是 `src/site.json`。
- 代码块深色配色靠 `main.css` 里 `.dark .markdown-body pre` 的 `!important` 覆盖 `--shiki-dark` 变量方案，改动浅色/深色样式时别删这段。

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
