// Markdown 集合的共享解析工具：posts.ts 与 showcases.ts 两个集合同用。
// 注意：scripts/admin.mjs 与 scripts/gen-feed.mjs 各有独立的 frontmatter 实现，
// 改这里的解析规则时要按 AGENTS.md 的「三处同步」约定处理。

export interface MarkdownDoc {
  slug: string
  title: string
  date: string
  tags: string[]
  summary: string
  words: number
  minutes: number
  component: import('vue').Component
}

/** 字数统计 + 阅读时长：CJK 字符按 1 算，其余按空白分词算 */
export function analyzeBody(body: string): { words: number; minutes: number } {
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

export function parseFrontmatter(raw: string): Record<string, unknown> {
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

export function toTags(value: unknown): string[] {
  if (Array.isArray(value))
    return value.map(String)
  if (typeof value === 'string' && value.trim())
    return value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  return []
}

/** 两次 glob 的通用组装：slug / frontmatter / 字数统计；decorate 补充集合自有字段，meta 传原始解析结果 */
export function toCollectionDoc<T extends MarkdownDoc>(
  path: string,
  mod: unknown,
  raw: string,
  decorate: (base: MarkdownDoc, meta: Record<string, unknown>) => T,
): T {
  const slug = path.split('/').pop()!.replace(/\.md$/, '')
  const meta = parseFrontmatter(raw)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component = ((mod as any).default ?? mod) as import('vue').Component
  const { words, minutes } = analyzeBody(raw)
  return decorate(
    {
      slug,
      title: String(meta.title ?? slug),
      date: String(meta.date ?? ''),
      tags: toTags(meta.tags),
      summary: String(meta.summary ?? ''),
      words,
      minutes,
      component,
    },
    meta,
  )
}
