import type { Component } from 'vue'
import orderJson from './showcase-order.json'
import { toCollectionDoc } from './markdown-meta'

export interface Showcase {
  slug: string
  title: string
  date: string
  /** 最后修订日期（frontmatter updated，可选） */
  updated: string
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

const orderIndex = new Map<string, number>(orderJson.map((slug, i) => [slug, i]))

function orderAwareCompare(a: Showcase, b: Showcase): number {
  const ia = orderIndex.has(a.slug)
  const ib = orderIndex.has(b.slug)
  if (ia && ib)
    return orderIndex.get(a.slug)! - orderIndex.get(b.slug)!
  if (ia)
    return -1
  if (ib)
    return 1
  return b.date.localeCompare(a.date)
}

export const showcases: Showcase[] = Object.entries(componentModules)
  .map(([path, mod]) => {
    const raw = rawModules[path] ?? ''
    return toCollectionDoc<Showcase>(path, mod, raw, (base, meta) => ({
      ...base,
      repo: String(meta.repo ?? ''),
    }))
  })
  // 手动排序优先：清单（src/showcase-order.json）里的项目按清单顺序排最前；
  // 未登记的项目排其后、保持日期倒序（与 posts.ts 的排序规则同款）
  .sort(orderAwareCompare)

export function getShowcase(slug: string): Showcase | undefined {
  return showcases.find(s => s.slug === slug)
}
