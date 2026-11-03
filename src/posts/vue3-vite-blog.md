---
title: 用 Vue 3 + Vite 搭一个极简博客
date: 2026-11-02
tags: [技术, Vue]
summary: 这个站本身就是一次实践：Vue 3 + Vite + Markdown，文章用 md 文件写，构建时渲染成页面。
---

这个站点就是用下面这套组合搭起来的，把过程记录一下。

## 技术选型

| 模块 | 选择 |
| --- | --- |
| 框架 | Vue 3 + TypeScript |
| 构建 | Vite |
| 路由 | Vue Router |
| 内容 | Markdown 文件 + `unplugin-vue-markdown` |
| 代码高亮 | Shiki（构建期高亮） |

## Markdown 怎么变成页面

核心思路：用 `import.meta.glob` 把 `posts/` 下的 `.md` 文件一次性收集起来：

```ts
// 编译后的组件，可直接 <component :is="..."> 渲染
const componentModules = import.meta.glob('./posts/*.md', { eager: true })
// 原文，用来解析 frontmatter（标题、日期、标签）
const rawModules = import.meta.glob('./posts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
```

每篇文章顶部的 frontmatter 长这样：

```yaml
---
title: 文章标题
date: 2026-11-02
tags: [技术, Vue]
summary: 一句话摘要
---
```

构建时插件把它们编译成 Vue 组件，运行时路由按 slug 找到对应组件直接渲染，**没有任何运行时的 Markdown 解析开销**。

## 代码高亮

高亮放在构建期做，用的是 Shiki，同时输出浅色 / 深色两套颜色（借助 CSS 变量）：

```ts
Markdown({
  markdownSetup: async md => md.use(await markdownItShiki({
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  })),
})
```

深色模式下再用一段 CSS 把 `--shiki-dark` 变量启用即可。

## 小结

这套方案的好处是：写作体验就是纯 Markdown，成本几乎为零，之后想部署也只是扔一个静态目录的事。
