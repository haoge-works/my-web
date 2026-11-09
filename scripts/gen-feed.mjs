// 构建期生成静态产物：feed.xml（RSS 订阅）/ sitemap.xml / robots.txt / search-index.json（站内搜索）
// 由 `npm run build` 在 vite build 之后调用（见 package.json），零 npm 依赖。
// frontmatter 解析是第三份「同一套规则」实现（只认字符串键 title/date/summary/source/repo/updated/draft + tags 数组），
// 读 posts 与 showcases 两个目录（showcases 用于 sitemap 收录 /projects 页）；
// 改 src/posts.ts 或 scripts/admin.mjs 的 frontmatter 规则时必须同步这里。
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const POSTS_DIR = path.join(ROOT, 'src', 'posts')
const SHOWCASES_DIR = path.join(ROOT, 'src', 'showcases')
const DIST = path.join(ROOT, 'dist')
const SITE_URL = (process.env.SITE_URL || 'https://hao-ge.tail0f5897.ts.net').replace(/\/$/, '')

/** 极简 frontmatter 解析：与 posts.ts 同款（键: 值，带引号可以剥掉，数组语法同 posts.ts） */
function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  const meta = {}
  for (const line of (match?.[1] ?? '').split(/\r?\n/)) {
    const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line.trim())
    if (m)
      meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return meta
}

/** tags 解析：数组语法或逗号分隔（与 posts.ts 的 toTags 同款） */
function parseTags(value) {
  const v = String(value ?? '').trim()
  if (v.startsWith('[') && v.endsWith(']'))
    return v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  if (v)
    return v.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  return []
}

/** 从目录读 md 清单（slug/title/date/summary/tags/draft + 正文纯文本），posts 与 showcases 共用 */
async function readCollection(dir) {
  const names = await fs.readdir(dir)
  return Promise.all(names
    .filter(n => n.endsWith('.md'))
    .map(async (name) => {
      const raw = await fs.readFile(path.join(dir, name), 'utf8')
      const meta = parseFrontmatter(raw)
      // 保留 raw 供搜索索引用；不再逐字数统计（前端已有同款 analyzeBody）
      return {
        slug: name.replace(/\.md$/, ''),
        title: meta.title ?? name,
        date: meta.date ?? '',
        summary: meta.summary ?? '',
        tags: parseTags(meta.tags),
        draft: meta.draft === 'true',
        raw,
      }
    }))
}

/** 正文 -> 搜索用纯文本：去 frontmatter/代码块/图片/markdown 标记，截断控制索引体积 */
function extractBodyText(raw) {
  const MAX_BODY = 3000
  return raw
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~{3}[\s\S]*?~{3}/g, ' ')
    .replace(/`[^`\n]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, ' ')
    .replace(/[*_~#>|]+/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_BODY)
}

/** 搜索索引：posts + showcases 合并（草稿排除），类型区分文章/项目案例 */
function buildSearchIndex(posts, showcases) {
  const entry = (type, doc) => ({
    type,
    slug: doc.slug,
    title: doc.title,
    summary: doc.summary,
    tags: doc.tags,
    date: doc.date,
    body: extractBodyText(doc.raw),
  })
  return [
    ...posts.map(p => entry('post', p)),
    ...showcases.map(s => entry('case', s)),
  ]
}

function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function rfc822(date) {
  const d = date ? new Date(`${date}T00:00:00Z`) : new Date()
  return d.toUTCString()
}

async function main() {
  const [siteRaw, postsRaw, showcasesRaw] = await Promise.all([
    fs.readFile(path.join(ROOT, 'src', 'site.json'), 'utf8'),
    readCollection(POSTS_DIR),
    readCollection(SHOWCASES_DIR),
  ])
  const site = JSON.parse(siteRaw)
  const siteName = `${site.name ?? '我'}的小站`
  const siteDesc = site.intro ?? '记录想法、文章与生活'

  const posts = postsRaw.filter(p => !p.draft).sort((a, b) => b.date.localeCompare(a.date))

  if (!posts.length)
    console.warn('gen-feed: 没有已发布文章，feed 仍会生成空频道')

  // sitemap 额外收录项目页（RSS 保持仅文章）
  const showcases = showcasesRaw
    .filter(s => !s.draft)
    .sort((a, b) => b.date.localeCompare(a.date))
  const lastModified = [posts[0]?.date, showcases[0]?.date].filter(Boolean).sort().reverse()[0] ?? ''

  const paths = ['', 'blog/', 'tags/', 'archives/', 'projects/', 'about/', ...posts.map(p => `blog/${p.slug}/`), ...showcases.map(s => `projects/${s.slug}/`)]

  /* feed.xml：RSS 2.0 + 自引用 */
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEsc(siteName)}</title>
    <link>${xmlEsc(SITE_URL)}</link>
    <description>${xmlEsc(siteDesc)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${rfc822(posts[0]?.date ?? '')}</lastBuildDate>
    <atom:link href="${xmlEsc(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml" />
${posts.map(p => `    <item>
      <title>${xmlEsc(p.title)}</title>
      <link>${xmlEsc(`${SITE_URL}/blog/${p.slug}`)}</link>
      <guid isPermaLink="true">${xmlEsc(`${SITE_URL}/blog/${p.slug}`)}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      ${p.summary ? `<description>${xmlEsc(p.summary)}</description>` : ''}
    </item>`).join('\n')}
  </channel>
</rss>
`

  /* sitemap.xml：全站 URL + 每篇文章 */
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map(p => `  <url><loc>${xmlEsc(`${SITE_URL}/${p}`)}</loc><lastmod>${rfc822(lastModified)}</lastmod></url>`).join('\n')}
</urlset>
`

  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`

  // search-index.json：站内搜索的构建期索引（草稿天然被 posts/showcases 过滤掉）
  const searchIndex = buildSearchIndex(posts, showcases)

  await fs.mkdir(DIST, { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(DIST, 'feed.xml'), feed, 'utf8'),
    fs.writeFile(path.join(DIST, 'sitemap.xml'), sitemap, 'utf8'),
    fs.writeFile(path.join(DIST, 'robots.txt'), robots, 'utf8'),
    fs.writeFile(path.join(DIST, 'search-index.json'), JSON.stringify(searchIndex), 'utf8'),
  ])
  console.log(`gen-feed: feed.xml / sitemap.xml / robots.txt / search-index.json -> ${path.relative(ROOT, DIST)}（${posts.length} 篇文章 + ${showcases.length} 个项目，索引 ${searchIndex.length} 条）`)
}

main().catch((err) => {
  console.error('gen-feed 失败：', err)
  process.exit(1)
})
