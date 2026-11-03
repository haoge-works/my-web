import type { Component } from 'vue'
import orderJson from './post-order.json'

export interface Post {
  slug: string
  title: string
  date: string
  tags: string[]
  summary: string
  /** 转载原文链接（原创文章为空） */
  source: string
  component: Component
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  const meta: Record<string, unknown> = {}
  if (!match)
    return meta

  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line.trim())
    if (!m)
      continue
    const [, key, rawValue] = m
    const value = rawValue.trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      meta[key] = value
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    }
    else {
      meta[key] = value.replace(/^["']|["']$/g, '')
    }
  }
  return meta
}

function toTags(value: unknown): string[] {
  if (Array.isArray(value))
    return value.map(String)
  if (typeof value === 'string' && value.trim())
    return value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  return []
}

// 同一份 md 文件：一份编译成可渲染的组件，一份原文用于解析 frontmatter
const componentModules = import.meta.glob('./posts/*.md', { eager: true })
const rawModules = import.meta.glob('./posts/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const posts: Post[] = (() => {
  const list = Object.entries(componentModules)
    .map(([path, mod]) => {
      const slug = path.split('/').pop()!.replace(/\.md$/, '')
      const meta = parseFrontmatter(rawModules[path] ?? '')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const component = ((mod as any).default ?? mod) as Component
      return {
        slug,
        title: String(meta.title ?? slug),
        date: String(meta.date ?? ''),
        tags: toTags(meta.tags),
        summary: String(meta.summary ?? ''),
        source: String(meta.source ?? ''),
        component,
      }
    })

  // 手动排序优先：清单（src/post-order.json）里的文章按清单顺序排最前；
  // 未登记的文章排其后、保持日期倒序
  const orderIndex = new Map<string, number>(orderJson.map((slug, i) => [slug, i]))
  return list.sort((a, b) => {
    const ia = orderIndex.has(a.slug)
    const ib = orderIndex.has(b.slug)
    if (ia && ib)
      return orderIndex.get(a.slug)! - orderIndex.get(b.slug)!
    if (ia)
      return -1
    if (ib)
      return 1
    return b.date.localeCompare(a.date)
  })
})()

export function getPost(slug: string): Post | undefined {
  return posts.find(p => p.slug === slug)
}
