// 构建期生成静态产物：feed.xml（RSS 订阅）/ sitemap.xml / robots.txt
// 由 `npm run build` 在 vite build 之后调用（见 package.json），零 npm 依赖。
// frontmatter 解析是第三份「同一套规则」实现（只认字符串键 title/date/summary/source/draft），
// 改 src/posts.ts 或 scripts/admin.mjs 的 frontmatter 规则时必须同步这里。
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const POSTS_DIR = path.join(ROOT, 'src', 'posts')
const DIST = path.join(ROOT, 'dist')
const SITE_URL = (process.env.SITE_URL || 'http://100.66.247.91').replace(/\/$/, '')

/** 极简 frontmatter 解析：与 posts.ts 同款（键: 值，带引号可以剥掉，数组不认） */
function parseFrontmatter(pathname) {
  const meta = {}
  for (const line of pathname) {
    const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line.trim())
    if (m)
      meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return meta
}

function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function rfc822(date) {
  const d = date ? new Date(`${date}T00:00:00Z`) : new Date()
  return d.toUTCString()
}

async function main() {
  const [siteRaw, names] = await Promise.all([
    fs.readFile(path.join(ROOT, 'src', 'site.json'), 'utf8'),
    fs.readdir(POSTS_DIR),
  ])
  const site = JSON.parse(siteRaw)
  const siteName = `${site.name ?? '我'}的小站`
  const siteDesc = site.intro ?? '记录想法、文章与生活'

  const posts = (await Promise.all(names
    .filter(n => n.endsWith('.md'))
    .map(async (name) => {
      const raw = await fs.readFile(path.join(POSTS_DIR, name), 'utf8')
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
      const meta = parseFrontmatter((match?.[1] ?? '').split(/\r?\n/))
      return {
        slug: name.replace(/\.md$/, ''),
        title: meta.title ?? name,
        date: meta.date ?? '',
        summary: meta.summary ?? '',
        draft: meta.draft === 'true',
      }
    })))
    .filter(p => !p.draft) // 草稿不进订阅与站点地图
    .sort((a, b) => b.date.localeCompare(a.date))

  if (!posts.length)
    console.warn('gen-feed: 没有已发布文章，feed 仍会生成空频道')

  const paths = ['', 'blog/', 'archives/', 'about/', ...posts.map(p => `blog/${p.slug}/`)]

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
${paths.map(p => `  <url><loc>${xmlEsc(`${SITE_URL}/${p}`)}</loc><lastmod>${rfc822(posts[0]?.date ?? '')}</lastmod></url>`).join('\n')}
</urlset>
`

  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`

  await fs.mkdir(DIST, { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(DIST, 'feed.xml'), feed, 'utf8'),
    fs.writeFile(path.join(DIST, 'sitemap.xml'), sitemap, 'utf8'),
    fs.writeFile(path.join(DIST, 'robots.txt'), robots, 'utf8'),
  ])
  console.log(`gen-feed: feed.xml / sitemap.xml / robots.txt -> ${path.relative(ROOT, DIST)}（${posts.length} 篇已发布文章）`)
}

main().catch((err) => {
  console.error('gen-feed 失败：', err)
  process.exit(1)
})
