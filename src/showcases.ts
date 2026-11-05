import type { Component } from 'vue'
import { toCollectionDoc } from './markdown-meta'

export interface Showcase {
  slug: string
  title: string
  date: string
  tags: string[]
  summary: string
  /** 项目 GitHub 仓库（frontmatter repo，可选） */
  repo: string
  /** 正文字数（不含 frontmatter 与代码块） */
  words: number
  /** 预计阅读分钟数 */
  minutes: number
  component: Component
}

// 同一份 md 文件：一份编译成可渲染的组件，一份原文用于解析 frontmatter（与 posts.ts 同款两份 glob）
const componentModules = import.meta.glob('./showcases/*.md', { eager: true })
const rawModules = import.meta.glob('./showcases/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const showcases: Showcase[] = Object.entries(componentModules)
  .map(([path, mod]) => {
    const raw = rawModules[path] ?? ''
    return toCollectionDoc<Showcase>(path, mod, raw, (base, meta) => ({
      ...base,
      repo: String(meta.repo ?? ''),
    }))
  })
  .sort((a, b) => b.date.localeCompare(a.date))

export function getShowcase(slug: string): Showcase | undefined {
  return showcases.find(s => s.slug === slug)
}
