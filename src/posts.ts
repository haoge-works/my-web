import type { Component } from 'vue'
import orderJson from './post-order.json'

export interface Post {
  slug: string
  title: string
  date: string
  /** 最后修订日期（frontmatter updated，面板编辑后有实际改动时自动写入） */
  updated: string
  tags: string[]
  summary: string
  /** 转载原文链接（原创文章为空） */
  source: string
  /** 正文字数（不含 frontmatter 与代码块） */
  words: number
  /** 预计阅读分钟数 */
  minutes: number
  component: Component
}

/** 字数统计 + 阅读时长：CJK 字符按 1 算，其余按空白分词算 */
function analyzeBody(body: string): { words: number; minutes: number } {
  const noCode = body
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~{3}[\s\S]*?~{3}/g, ' ')
  const cjk = (noCode.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length
  const latin = noCode
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  const words = cjk + latin
  // 中文阅读速度约 400 字/分钟，最低算 1 分钟
  const minutes = Math.max(1, Math.round(words / 400))
  return { words, minutes }
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
      const raw = rawModules[path] ?? ''
      const meta = parseFrontmatter(raw)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const component = ((mod as any).default ?? mod) as Component
      const { words, minutes } = analyzeBody(raw)
      return {
        slug,
        title: String(meta.title ?? slug),
        date: String(meta.date ?? ''),
        updated: String(meta.updated ?? ''),
        tags: toTags(meta.tags),
        summary: String(meta.summary ?? ''),
        source: String(meta.source ?? ''),
        words,
        minutes,
        component,
        // 草稿只用于构建期过滤，不进导出列表
        _draft: String(meta.draft ?? '') === 'true',
      }
    })
    // frontmatter draft: true 的文章不进站点（草稿机制）
    .filter(p => !(p as { _draft?: boolean })._draft)

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
