# my-web · 个人主页 + 博客

一个极简风格的个人网站：主页展示自己，附带 Markdown 博客。
技术栈：**Vue 3 + TypeScript + Vite + Vue Router + unplugin-vue-markdown + Shiki**。

## 快速开始

```bash
npm install      # 安装依赖
npm run dev      # 本地开发，默认 http://localhost:5173
npm run build    # 构建静态文件到 dist/
npm run preview  # 本地预览构建产物
npm run typecheck
```

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
---
```

3. 正文用 Markdown 随便写，保存后开发服务器会自动热更新（新文章需要刷新）

详细写作指南：[docs/images.md](docs/images.md)（添加图片）、[docs/links.md](docs/links.md)（外部链接、站内互链与转载）。

贴图常用方式：把图片放到项目根目录 `public/images/`，在正文中用 `![说明](/images/xxx.png)` 引用——图片随站点部署，永不失效（外链图床也行，但依赖对方网站）。

## 怎么改个人信息

编辑 `src/site.ts`，替换里面的占位内容即可（名字、介绍、联系方式、关于页文字）。

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
├─ site.ts           # 站点信息（占位内容，需要你自己填）
├─ router/index.ts   # 路由
├─ composables/useTheme.ts  # 深色模式逻辑
├─ styles/main.css   # 全局样式 + 设计变量
├─ components/       # 导航、页脚、主题按钮、文章列表
├─ pages/            # 首页 / 博客列表 / 文章详情 / 关于
└─ posts/*.md        # 博客文章
```
