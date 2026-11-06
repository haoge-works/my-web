// 相关文档推荐：tags 交集数排序（tie-break 日期倒序），PostPage 与 ProjectCasePage 共用。
// 无交集时不推荐（调用方拿空数组自行隐藏区块）。

export interface RelatedDoc {
  slug: string
  title: string
  date: string
  tags: string[]
}

export function findRelated<T extends RelatedDoc>(current: RelatedDoc, pool: T[], count = 3): T[] {
  return pool
    .filter(d => d.slug !== current.slug)
    .map(d => ({
      doc: d,
      score: d.tags.reduce((n, t) => (current.tags.includes(t) ? n + 1 : n), 0),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || b.doc.date.localeCompare(a.doc.date))
    .slice(0, count)
    .map(x => x.doc)
}
