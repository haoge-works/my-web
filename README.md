# my-web · 个人主页 + 博客

一个极简风格的个人网站：主页展示自己，附带 Markdown 博客。
技术栈：**Vue 3 + TypeScript + Vite + Vue Router + unplugin-vue-markdown + Shiki**。

> **注意**：`src/posts/*.md`（文章内容）已加入 `.gitignore`，**不入 git 仓库**。文章主要保存在本地，但每次 `npm run deploy` 会把内容快照同步到服务器 `/home/ubuntu/blog-src`（兼作云端备份，多终端编辑时按 mtime 新者胜自动拉回，防丢稿）；重新克隆后跑一次 deploy 即可找回。

## 快速开始

```bash
npm install      # 安装依赖
npm run dev      # 本地开发，默认 http://localhost:5173
npm run admin    # 本地管理面板：本机 http://127.0.0.1:5174 + tailnet 设备 http://<tailscale-ip>:5174
npm run build    # 构建静态文件到 dist/
npm run deploy   # 一键三段式部署（拉取服务器内容 -> build -> 双推送 -> 验证），详见下方「部署」
npm run preview  # 本地预览构建产物
npm run typecheck
```

## 部署

`npm run deploy` 是六步部署，服务器 `ubuntu@100.66.247.91`（Tailscale 内网）：

0. **git 闸门**：`fetch` 后检查本机是否落后 `origin/main`，落后则中止——先 `git pull --rebase` 再 deploy（防止旧代码构建覆盖另一终端已部署的新版本）
1. **拉取合并**：先把服务器内容目录 `/home/ubuntu/blog-src`（posts/ + showcases/ + site.json + post-order.json）里「比本机新或本机没有」的文件拉回本机构建（mtime 新者胜，防多终端编辑丢稿）
2. **构建**：`npm run build`（feed/sitemap/robots 里的绝对地址默认用 `SITE_URL=https://ubuntu-server.tail0f5897.ts.net`，可用环境变量覆盖）
3. **双推送**：dist 上传 nginx 站点 `/var/www/my-web` + 合并后的内容快照回传 `blog-src`（服务器兼作云端备份）
4. **验证**：公网首页 + feed.xml 均返回 200

访问地址：

- 公网（Tailscale Funnel，HTTPS，**已配置为后台常驻、服务器重启自动恢复**）：`https://ubuntu-server.tail0f5897.ts.net/`
- tailnet 内网：`http://100.66.247.91/`

前提与说明：

- 前提：私钥已加入 Windows `ssh-agent`（服务需为 Running，本机已设为开机自动）；**部署前务必确保代码已提交/推进与远程同步**（闸门会拦截落后的本地代码）
- nginx 端已配好 SPA fallback（直达/刷新 `/blog/xxx` 正常）与静态资源缓存策略
- 服务器只跑 nginx 零构建工具；写完文章在本地（面板/dev）确认后跑 deploy 同步
- Funnel 管理：服务器上免 sudo（operator 模式），查看 `tailscale funnel status`，关闭 `tailscale funnel --https=443 off`

## 怎么写文章

1. 在 `src/posts/` 下新建 `xxx.md` 文件（文件名即 URL 里的 slug）
2. 顶部写 frontmatter：

```yaml
---
title: 文章标题
date: 2026-11-02
tags: [技术, 随笔]
summary: 一句话摘要（可选，列表页会显示）
source: https://原文链接   （转载文章才写；原创不要写）
draft: true                （可选：写 true 存为草稿，不上站点；面板里勾选即可）
---
```

**手动排序**：列表默认日期倒序；想置顶/自定义顺序，在管理面板点文章行的 ▲▼，顺序保存在 `src/post-order.json`（清单内文章按清单排最前，未登记文章在后按日期倒序）。

3. 正文用 Markdown 随便写，保存后开发服务器会自动热更新（新文章需要刷新）

详细写作指南：[docs/images.md](docs/images.md)（添加图片）、[docs/links.md](docs/links.md)（外部链接、站内互链与转载）。

管理面板（`npm run admin`）支持**图形化编辑两个集合**：「文章」（含草稿、转载标注、手动排序）和「项目」（`/projects` 页的项目案例 md，比文章多一个「项目仓库 repo」字段，按日期倒序）；数据同样走 deploy 的内容同步机制（服务器快照兼备份）。

贴图常用方式：把图片放到项目根目录 `public/images/`，在正文中用 `![说明](/images/xxx.png)` 引用——图片随站点部署，永不失效（外链图床也行，但依赖对方网站）。

## 站点内置功能

- **文章目录（TOC）**：宽屏（≥1240px）阅读长文时正文右侧自动生成大纲，滚动实时高亮
- **代码块复制**：鼠标悬停代码块右上角出现「复制」按钮
- **阅读时长**：列表与文章页显示「约 N 字 · M 分钟」（构建期按 400 字/分钟折算，不含代码块）
- **上一篇/下一篇**：文章页底部按全站排序衔接
- **归档页**：`/archives` 按年份排列全部文章
- **RSS 订阅**：`/feed.xml`（`npm run build` 自动生成，草稿不进订阅）
- **搜索引擎友好**：`/sitemap.xml` + `/robots.txt`（同上自动生成；站点地址默认 `https://ubuntu-server.tail0f5897.ts.net`，可用环境变量 `SITE_URL` 覆盖）

## 怎么改个人信息

编辑 `src/site.json`（或用 `npm run admin` 管理面板的「站点信息」表单），改名、介绍、联系、关于页文字。`src/site.ts` 只做类型导出，不要手工改数据。

## 深色模式

- 默认跟随系统（`prefers-color-scheme`）
- 点击导航栏右侧的 ◐ 按钮可手动切换：跟随系统 → 浅色 → 深色
- 手动选择会存进 `localStorage`，下次访问保持

## 部署（以后要做的事）

`npm run build` 产物在 `dist/`，是纯静态文件，可托管到任何静态服务：

- **GitHub Pages（子路径部署，如 `/my-web/`）**：把 `vite.config.ts` 里的 `base` 改成 `'/my-web/'`，或用 GitHub Actions 构建
- **Cloudflare Pages / Netlify / Vercel**：构建命令 `npm run build`，输出目录 `dist`，`base` 保持 `'/'` 不动（自定义域名或用户名子域的场景）

## 目录结构

```
src/
├─ posts.ts          # 博客数据层：收集 md、解析 frontmatter、按日期排序
├─ site.json          # 站点信息数据源（管理面板可编辑；site.ts 只做类型导出）
├─ router/index.ts   # 路由
├─ composables/useTheme.ts  # 深色模式逻辑
├─ styles/main.css   # 全局样式 + 设计变量
├─ components/       # 导航、页脚、主题按钮、文章列表
├─ pages/            # 首页 / 博客列表 / 文章详情 / 关于
└─ posts/*.md        # 博客文章
```
