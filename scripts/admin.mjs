// 本地管理面板：图形化新建/编辑/删除博客文章 + 编辑站点信息
// 监听地址：本机 127.0.0.1 + 自动探测的 Tailscale 虚拟地址（tailnet 内设备可访问）
// 数据全部是文件读写，无数据库；启动：npm run admin
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const POSTS_DIR = path.join(ROOT, 'src', 'posts')
const SHOWCASES_DIR = path.join(ROOT, 'src', 'showcases')
const SITE_JSON = path.join(ROOT, 'src', 'site.json')
const ORDER_JSON = path.join(ROOT, 'src', 'post-order.json')
const PORT = Number(process.env.ADMIN_PORT || 5174)

/** 自动探测 Tailscale 虚拟地址（适配器名含 tailscale 的第一个非内部 IPv4） */
function detectTailscaleIP() {
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (!/tailscale/i.test(name))
      continue
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal)
        return a.address
    }
  }
  return null
}

// 计算要监听的地址：默认 = 本机 + Tailscale；可用 ADMIN_HOSTS 环境变量逗号分隔覆盖
function detectHosts() {
  if (process.env.ADMIN_HOSTS)
    return process.env.ADMIN_HOSTS.split(',').map(s => s.trim()).filter(Boolean)
  const tailscale = detectTailscaleIP()
  return tailscale ? ['127.0.0.1', tailscale] : ['127.0.0.1']
}

const HOSTS = detectHosts()

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/* ---------- frontmatter 生成与解析（与 src/posts.ts 的解析规则保持一致） ---------- */

function yamlString(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

function yamlList(arr) {
  return '[' + arr.map(v => yamlString(v)).join(', ') + ']'
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

async function exists(file) {
  try {
    await fs.access(file)
    return true
  }
  catch {
    return false
  }
}

/** 读文件不存在返回 null（供修订时间比对用，不炸 404） */
async function readFileOrNull(file) {
  try {
    return await fs.readFile(file, 'utf8')
  }
  catch {
    return null
  }
}

function frontmatter(meta) {
  const lines = ['---']
  lines.push('title: ' + yamlString(meta.title ?? '未命名'))
  lines.push('date: ' + yamlString(meta.date ?? today()))
  if (meta.updated)
    lines.push('updated: ' + yamlString(meta.updated))
  lines.push('tags: ' + yamlList(meta.tags ?? []))
  if (meta.summary)
    lines.push('summary: ' + yamlString(meta.summary))
  if (meta.source)
    lines.push('source: ' + yamlString(meta.source))
  if (meta.repo)
    lines.push('repo: ' + yamlString(meta.repo))
  if (meta.draft)
    lines.push('draft: true')
  lines.push('---', '')
  return lines.join('\n')
}

function buildMarkdown(meta, content) {
  return frontmatter(meta) + String(content ?? '')
}

/** 解析顺序：整个 frontmatter 块剥离后，逐行拆 key: value；列表值形如 ["a", "b"] */
function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  const meta = {}
  let body = raw.replace(/^\uFEFF/, '')
  if (match) {
    body = body.slice(match[0].length)
    for (const line of match[1].split(/\r?\n/)) {
      const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line.trim())
      if (!m)
        continue
      const key = m[1]
      const value = m[2].trim()
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
  }
  return { meta, body }
}

function toTags(value) {
  if (Array.isArray(value))
    return value.map(String)
  if (typeof value === 'string' && value.trim())
    return value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  return []
}

/* ---------- 文件读写 ---------- */

function slugToPathIn(dir, slug) {
  if (!SLUG_RE.test(slug))
    throw httpError(400, 'slug 只允许小写字母、数字和连字符')
  const file = path.join(dir, slug + '.md')
  if (path.dirname(file) !== dir)
    throw httpError(400, '非法 slug')
  return file
}

function slugToPath(slug) {
  return slugToPathIn(POSTS_DIR, slug)
}

function autoSlug(prefix = 'post') {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return prefix + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes())
}

async function readOrder() {
  try {
    const raw = JSON.parse(await fs.readFile(ORDER_JSON, 'utf8'))
    return Array.isArray(raw) ? raw.map(String) : []
  }
  catch {
    return []
  }
}

async function listPosts() {
  const names = (await fs.readdir(POSTS_DIR)).filter(f => f.endsWith('.md')).sort().reverse()
  const posts = []
  for (const name of names) {
    const raw = await fs.readFile(path.join(POSTS_DIR, name), 'utf8')
    const { meta } = parseFrontmatter(raw)
    posts.push({
      slug: name.replace(/\.md$/, ''),
      title: String(meta.title ?? name),
      date: String(meta.date ?? ''),
      updated: String(meta.updated ?? ''),
      tags: toTags(meta.tags),
      summary: String(meta.summary ?? ''),
      source: String(meta.source ?? ''),
      draft: String(meta.draft ?? '') === 'true',
    })
  }
  // 与 src/posts.ts 的排序规则保持一致：清单顺序优先，未登记按日期倒序
  const orderIndex = new Map((await readOrder()).map((slug, i) => [slug, i]))
  return posts.sort((a, b) => {
    const ia = orderIndex.has(a.slug)
    const ib = orderIndex.has(b.slug)
    if (ia && ib)
      return orderIndex.get(a.slug) - orderIndex.get(b.slug)
    if (ia)
      return -1
    if (ib)
      return 1
    return String(b.date).localeCompare(String(a.date))
  })
}

async function listShowcases() {
  const names = (await fs.readdir(SHOWCASES_DIR)).filter(f => f.endsWith('.md')).sort().reverse()
  const items = []
  for (const name of names) {
    const raw = await fs.readFile(path.join(SHOWCASES_DIR, name), 'utf8')
    const { meta } = parseFrontmatter(raw)
    items.push({
      slug: name.replace(/\.md$/, ''),
      title: String(meta.title ?? name),
      date: String(meta.date ?? ''),
      tags: toTags(meta.tags),
      summary: String(meta.summary ?? ''),
      repo: String(meta.repo ?? ''),
    })
  }
  // 与 src/showcases.ts 的排序规则保持一致：仅日期倒序（无手动排序/草稿机制）
  return items.sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

function normalizePostInput(body) {
  const title = String(body.title ?? '').trim()
  if (!title)
    throw httpError(400, '标题不能为空')
  const tags = toTags(body.tags)
  return {
    title,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(body.date ?? '')) ? String(body.date) : today(),
    tags,
    summary: typeof body.summary === 'string' ? body.summary.trim() : '',
    source: typeof body.source === 'string' ? body.source.trim() : '',
    draft: body.draft === true,
    content: typeof body.content === 'string' ? body.content : '',
  }
}

/** PUT 编辑时自动维护修订时间：内容/元信息有实际改动才写 updated(=今天)；
 * prevRaw 为旧文件原文（新建/改名找不到则传 null，新文件不写 updated） */
function resolveUpdated(prevRaw, meta) {
  if (prevRaw == null)
    return ''
  const prev = parseFrontmatter(prevRaw)
  const unchanged
    = String(prev.body) === meta.content
      && String(prev.meta.title ?? '') === meta.title
      && String(prev.meta.date ?? '') === meta.date
      && toTags(prev.meta.tags).join(',') === meta.tags.join(',')
      && String(prev.meta.summary ?? '') === meta.summary
      && String(prev.meta.source ?? '') === meta.source
  return unchanged ? String(prev.meta.updated ?? '') : today()
}

function normalizeShowcaseInput(body) {
  const title = String(body.title ?? '').trim()
  if (!title)
    throw httpError(400, '标题不能为空')
  const tags = toTags(body.tags)
  const repo = typeof body.repo === 'string' ? body.repo.trim() : ''
  if (repo && !/^https?:\/\//.test(repo))
    throw httpError(400, 'repo 必须是 http(s) 链接')
  return {
    title,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(body.date ?? '')) ? String(body.date) : today(),
    tags,
    summary: typeof body.summary === 'string' ? body.summary.trim() : '',
    repo,
    content: typeof body.content === 'string' ? body.content : '',
  }
}

function normalizeSite(body) {
  const links = Array.isArray(body.links)
    ? body.links
        .map(l => ({ label: String(l?.label ?? '').trim(), url: String(l?.url ?? '').trim() }))
        .filter(l => l.label && l.url)
    : []
  const about = Array.isArray(body.about)
    ? body.about.map(s => String(s).trim()).filter(Boolean)
    : []
  const name = String(body.name ?? '').trim()
  const intro = String(body.intro ?? '').trim()
  if (!name)
    throw httpError(400, '站点名称不能为空')
  return { name, intro, about, links }
}

/* ---------- HTTP 基础设施 ---------- */

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req)
    chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw)
    return {}
  try {
    return JSON.parse(raw)
  }
  catch {
    throw httpError(400, '请求体不是合法 JSON')
  }
}

/* ---------- 面板页面（零依赖单页，原生 fetch） ---------- */

const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>本地管理面板 · my-web</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #fafaf9; color: #1c1c1a;
    font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 15px; line-height: 1.7;
  }
  header { border-bottom: 1px solid #e6e6e2; padding: 12px 24px; display: flex; gap: 20px; align-items: center; }
  header strong { font-size: 1.05em; }
  nav button { appearance: none; border: none; background: none; padding: 6px 12px; cursor: pointer; color: #6f6f6a; border-radius: 6px; font-size: 0.95em; }
  nav button:hover { color: #1c1c1a; }
  nav button.on { background: #1c1c1a; color: #fafaf9; }
  main { max-width: 860px; margin: 0 auto; padding: 24px 20px 60px; }
  h2 { font-size: 1.15em; margin: 18px 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; border-bottom: 1px solid #e6e6e2; padding: 8px 6px; vertical-align: top; }
  th { font-weight: 600; color: #6f6f6a; font-size: 0.88em; }
  .muted { color: #6f6f6a; font-size: 0.85em; }
  label { display: block; margin: 12px 0 4px; font-size: 0.9em; color: #6f6f6a; }
  input[type=text], textarea {
    width: 100%; padding: 8px 10px; border: 1px solid #e6e6e2; border-radius: 6px;
    background: #fff; color: inherit; font: inherit;
  }
  textarea { min-height: 160px; resize: vertical; }
  textarea.code { font-family: Consolas, monospace; font-size: 13.5px; min-height: 320px; }
  .row { display: flex; gap: 12px; }
  .row > * { flex: 1; }
  button.act {
    appearance: none; border: 1px solid #1c1c1a; background: #1c1c1a; color: #fafaf9;
    padding: 7px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9em; margin-top: 14px;
  }
  button.act.ghost { background: #fafaf9; color: #1c1c1a; }
  button.act.ghost:hover { border-color: #6f6f6a; }
  button.act:hover { opacity: 0.88; }
  button.mini { appearance: none; border: 1px solid #e6e6e2; background: #fff; color: #1c1c1a; border-radius: 6px; padding: 3px 10px; cursor: pointer; font-size: 0.82em; }
  button.mini:hover { border-color: #6f6f6a; }
  .tip { background: #f4f4f2; border: 1px solid #e6e6e2; border-radius: 8px; padding: 8px 12px; font-size: 0.85em; color: #6f6f6a; margin: 12px 0; }
  .err { color: #b3261e; font-size: 0.9em; margin-top: 10px; }
  .linkrow { display: flex; gap: 8px; margin: 6px 0; }
  .linkrow input { flex: 1; }
  .linkrow button { flex: 0 0 auto; }
</style>
</head>
<body>
<header>
  <strong>my-web 本地管理面板</strong>
  <nav>
    <button id="tab-posts" class="on" onclick="showTab('posts')">文章</button>
    <button id="tab-showcases" onclick="showTab('showcases')">项目</button>
    <button id="tab-site" onclick="showTab('site')">站点信息</button>
  </nav>
  <span style="margin-left:auto" class="muted">仅本机与 tailnet 设备可访问 · 配合 npm run dev 使用</span>
</header>
<main>

  <section id="view-posts">
    <div id="post-list">
      <h2>文章列表 <button class="mini" onclick="newPost()">＋ 新建文章</button></h2>
      <div class="tip">新建/修改保存后，在 dev 站点（localhost:5173）刷新即可看到；新增文件需要手动刷新一次。▲▼ 按钮手动排序：清单里的文章排最前，未登记文章在后按日期倒序。</div>
      <div id="post-rows">加载中…</div>
    </div>

    <div id="post-editor" style="display:none">
      <h2 id="editor-title">新建文章</h2>
      <label>标题 *</label><input type="text" id="f-title" />
      <div class="row">
        <div><label>日期</label><input type="text" id="f-date" placeholder="YYYY-MM-DD，留空为今天" /></div>
        <div><label>URL slug（小写英文/数字/连字符，留空自动生成）</label><input type="text" id="f-slug" /></div>
      </div>
      <div class="row">
        <div><label>标签（逗号分隔）</label><input type="text" id="f-tags" placeholder="技术, 教程" /></div>
        <div><label>转载原文 URL（原创留空）</label><input type="text" id="f-source" /></div>
      </div>
      <label>摘要（列表页显示，可留空）</label><input type="text" id="f-summary" />
      <label style="display:inline-block;margin-top:8px"><input type="checkbox" id="f-draft" style="vertical-align:middle" /> 草稿（保存为草稿，不会出现在站点上）</label>
      <label>正文（Markdown）</label><textarea id="f-content" class="code"></textarea>
      <p id="post-error" class="err" style="display:none"></p>
      <button class="act" onclick="savePost()">保存</button>
      <button class="act ghost" onclick="closeEditor()">返回列表</button>
      <span class="muted" id="edit-slug"></span>
    </div>
  </section>

  <section id="view-showcases" style="display:none">
    <div id="showcase-list">
      <h2>项目列表 <button class="mini" onclick="newShowcase()">＋ 新建项目</button></h2>
      <div class="tip">对应 src/showcases/*.md，按日期倒序展示在 /projects。字段比文章多一个「项目仓库 repo」，无草稿与手动排序。</div>
      <div id="showcase-rows">加载中…</div>
    </div>

    <div id="showcase-editor" style="display:none">
      <h2 id="showcase-editor-title">新建项目</h2>
      <label>标题 *</label><input type="text" id="s2-title" />
      <div class="row">
        <div><label>日期</label><input type="text" id="s2-date" placeholder="YYYY-MM-DD，留空为今天" /></div>
        <div><label>URL slug（小写英文/数字/连字符，留空自动生成）</label><input type="text" id="s2-slug" /></div>
      </div>
      <div class="row">
        <div><label>标签（逗号分隔）</label><input type="text" id="s2-tags" placeholder="Python, Flask" /></div>
        <div><label>项目仓库 repo URL（无仓库留空）</label><input type="text" id="s2-repo" placeholder="https://github.com/..." /></div>
      </div>
      <label>摘要（项目列表页显示，可留空）</label><input type="text" id="s2-summary" />
      <label>正文（Markdown，项目详情页内容）</label><textarea id="s2-content" class="code"></textarea>
      <p id="showcase-error" class="err" style="display:none"></p>
      <button class="act" onclick="saveShowcase()">保存</button>
      <button class="act ghost" onclick="closeShowcaseEditor()">返回列表</button>
      <span class="muted" id="edit-showcase-slug"></span>
    </div>
  </section>

  <section id="view-site" style="display:none">
    <h2>站点信息</h2>
    <div class="tip">对应 src/site.json —— 首页大标题、一句话介绍、关于页、页脚署名都会同步更新。</div>
    <label>站点名 / 你的名字 *</label><input type="text" id="s-name" />
    <label>一句话介绍</label><input type="text" id="s-intro" />
    <label>关于页介绍（每行一段）</label><textarea id="s-about" style="min-height:100px"></textarea>
    <label>社交 / 联系链接</label>
    <div id="s-links"></div>
    <button class="mini" onclick="addLinkRow('','')">＋ 添加一条链接</button>
    <p id="site-error" class="err" style="display:none"></p>
    <br />
    <button class="act" onclick="saveSite()">保存站点信息</button>
  </section>

</main>

<script>
var currentSlug = null
var currentShowcaseSlug = null

function showTab(name) {
  document.getElementById('view-posts').style.display = name === 'posts' ? '' : 'none'
  document.getElementById('view-showcases').style.display = name === 'showcases' ? '' : 'none'
  document.getElementById('view-site').style.display = name === 'site' ? '' : 'none'
  document.getElementById('tab-posts').className = name === 'posts' ? 'on' : ''
  document.getElementById('tab-showcases').className = name === 'showcases' ? 'on' : ''
  document.getElementById('tab-site').className = name === 'site' ? 'on' : ''
  if (name === 'posts') refreshPosts()
  if (name === 'showcases') refreshShowcases()
  if (name === 'site') loadSite()
}

function esc(s) {
  var d = document.createElement('div')
  d.textContent = s == null ? '' : String(s)
  return d.innerHTML
}

/* ---------- 文章 ---------- */

var postsRef = [] // 当前排序后的列表（供上下移动用）

function refreshPosts() {
  document.getElementById('post-editor').style.display = 'none'
  document.getElementById('post-list').style.display = ''
  fetch('/api/posts').then(function (r) { return r.json() }).then(function (posts) {
    postsRef = posts
    if (!posts.length) {
      document.getElementById('post-rows').innerHTML = '<p class="muted">还没有文章，点右上角「＋ 新建文章」。</p>'
      return
    }
    var html = '<table><tr><th>顺序</th><th>标题</th><th>日期</th><th>标签</th><th>操作</th></tr>'
    for (var i = 0; i < posts.length; i++) {
      var p = posts[i]
      var tagsHtml = ''
      for (var j = 0; j < p.tags.length; j++) tagsHtml += '#' + esc(p.tags[j]) + ' '
      if (p.draft) tagsHtml += '<b>草稿</b> '
      if (p.source) tagsHtml += '<span class="muted">转载</span>'
      html += '<tr><td style="white-space:nowrap">'
        + '<button class="mini" onclick="movePost(' + i + ', -1)">▲</button> '
        + '<button class="mini" onclick="movePost(' + i + ', 1)">▼</button>'
        + '</td>'
        + '<td>' + esc(p.title) + '<div class="muted">/' + esc(p.slug) + '</div></td>'
        + '<td class="muted">' + esc(p.date) + (p.updated && p.updated !== p.date ? '<div>修订 ' + esc(p.updated) + '</div>' : '') + '</td>'
        + '<td class="muted">' + tagsHtml + '</td>'
        + '<td style="white-space:nowrap">'
        + '<button class="mini" onclick="openPost(\\'' + esc(p.slug) + '\\')">编辑</button> '
        + '<button class="mini" onclick="removePost(\\'' + esc(p.slug) + '\\')">删除</button>'
        + '</td></tr>'
    }
    html += '</table>'
    document.getElementById('post-rows').innerHTML = html
  })
}

function movePost(index, dir) {
  var target = index + dir
  if (target < 0 || target >= postsRef.length)
    return
  var swapped = postsRef.slice()
  var tmp = swapped[index]
  swapped[index] = swapped[target]
  swapped[target] = tmp
  fetch('/api/post-order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: swapped.map(function (p) { return p.slug }) }) })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
    .then(function (x) {
      // 成功与否都重新拉列表，保证与磁盘状态一致
      refreshPosts()
    })
}

function showEditor(mode, slug) {
  document.getElementById('post-list').style.display = 'none'
  document.getElementById('post-editor').style.display = ''
  document.getElementById('editor-title').textContent = mode === 'new' ? '新建文章' : '编辑文章'
  document.getElementById('edit-slug').textContent = slug ? 'slug: ' + slug : ''
  document.getElementById('post-error').style.display = 'none'
  currentSlug = slug || null
}

function newPost() {
  showEditor('new', null)
  document.getElementById('f-title').value = ''
  document.getElementById('f-date').value = ''
  document.getElementById('f-slug').value = ''
  document.getElementById('f-tags').value = ''
  document.getElementById('f-source').value = ''
  document.getElementById('f-summary').value = ''
  document.getElementById('f-draft').checked = false
  document.getElementById('f-content').value = ''
}

function openPost(slug) {
  fetch('/api/posts/' + encodeURIComponent(slug))
    .then(function (r) { return r.json() })
    .then(function (p) {
      showEditor('edit', p.slug)
      document.getElementById('f-title').value = p.title
      document.getElementById('f-date').value = p.date
      document.getElementById('f-slug').value = p.slug
      document.getElementById('f-tags').value = (p.tags || []).join(', ')
      document.getElementById('f-source').value = p.source || ''
      document.getElementById('f-summary').value = p.summary || ''
      document.getElementById('f-draft').checked = p.draft === true
      document.getElementById('f-content').value = p.content || ''
    })
}

function postError(msg) {
  var el = document.getElementById('post-error')
  el.textContent = msg
  el.style.display = ''
}

function gatherPost() {
  return {
    title: document.getElementById('f-title').value.trim(),
    date: document.getElementById('f-date').value.trim(),
    slug: document.getElementById('f-slug').value.trim(),
    tags: document.getElementById('f-tags').value.trim(),
    source: document.getElementById('f-source').value.trim(),
    summary: document.getElementById('f-summary').value.trim(),
    draft: document.getElementById('f-draft').checked,
    content: document.getElementById('f-content').value,
  }
}

function savePost() {
  var body = gatherPost()
  var req = currentSlug
    ? fetch('/api/posts/' + encodeURIComponent(currentSlug), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    : fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  req.then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
    .then(function (x) {
      if (x.ok) { refreshPosts(); return }
      postError(x.j && x.j.error ? x.j.error : '保存失败')
    })
}

function removePost(slug) {
  if (!confirm('确定删除文章「' + slug + '」？此操作直接删文件，不可撤销。')) return
  fetch('/api/posts/' + encodeURIComponent(slug), { method: 'DELETE' })
    .then(function () { refreshPosts() })
}

function closeEditor() { refreshPosts() }

/* ---------- 项目（showcases） ---------- */

function refreshShowcases() {
  document.getElementById('showcase-editor').style.display = 'none'
  document.getElementById('showcase-list').style.display = ''
  fetch('/api/showcases').then(function (r) { return r.json() }).then(function (items) {
    if (!items.length) {
      document.getElementById('showcase-rows').innerHTML = '<p class="muted">还没有项目，点右上角「＋ 新建项目」。</p>'
      return
    }
    var html = '<table><tr><th>标题</th><th>日期</th><th>标签</th><th>仓库</th><th>操作</th></tr>'
    for (var i = 0; i < items.length; i++) {
      var s = items[i]
      var tagsHtml = ''
      for (var j = 0; j < s.tags.length; j++) tagsHtml += '#' + esc(s.tags[j]) + ' '
      var repoHtml = s.repo ? '<a href="' + esc(s.repo) + '" target="_blank" rel="noopener noreferrer">' + esc(s.repo.replace(/^https?:\\/\\//, '')) + '</a>' : ''
      html += '<tr>'
        + '<td>' + esc(s.title) + '<div class="muted">/projects/' + esc(s.slug) + '</div></td>'
        + '<td class="muted">' + esc(s.date) + '</td>'
        + '<td class="muted">' + tagsHtml + '</td>'
        + '<td class="muted">' + repoHtml + '</td>'
        + '<td style="white-space:nowrap">'
        + '<button class="mini" onclick="openShowcase(\\'' + esc(s.slug) + '\\')">编辑</button> '
        + '<button class="mini" onclick="removeShowcase(\\'' + esc(s.slug) + '\\')">删除</button>'
        + '</td></tr>'
    }
    html += '</table>'
    document.getElementById('showcase-rows').innerHTML = html
  })
}

function showShowcaseEditor(mode, slug) {
  document.getElementById('showcase-list').style.display = 'none'
  document.getElementById('showcase-editor').style.display = ''
  document.getElementById('showcase-editor-title').textContent = mode === 'new' ? '新建项目' : '编辑项目'
  document.getElementById('edit-showcase-slug').textContent = slug ? 'slug: ' + slug : ''
  document.getElementById('showcase-error').style.display = 'none'
  currentShowcaseSlug = slug || null
}

function newShowcase() {
  showShowcaseEditor('new', null)
  document.getElementById('s2-title').value = ''
  document.getElementById('s2-date').value = ''
  document.getElementById('s2-slug').value = ''
  document.getElementById('s2-tags').value = ''
  document.getElementById('s2-repo').value = ''
  document.getElementById('s2-summary').value = ''
  document.getElementById('s2-content').value = ''
}

function openShowcase(slug) {
  fetch('/api/showcases/' + encodeURIComponent(slug))
    .then(function (r) { return r.json() })
    .then(function (s) {
      showShowcaseEditor('edit', s.slug)
      document.getElementById('s2-title').value = s.title
      document.getElementById('s2-date').value = s.date
      document.getElementById('s2-slug').value = s.slug
      document.getElementById('s2-tags').value = (s.tags || []).join(', ')
      document.getElementById('s2-repo').value = s.repo || ''
      document.getElementById('s2-summary').value = s.summary || ''
      document.getElementById('s2-content').value = s.content || ''
    })
}

function showcaseError(msg) {
  var el = document.getElementById('showcase-error')
  el.textContent = msg
  el.style.display = ''
}

function gatherShowcase() {
  return {
    title: document.getElementById('s2-title').value.trim(),
    date: document.getElementById('s2-date').value.trim(),
    slug: document.getElementById('s2-slug').value.trim(),
    tags: document.getElementById('s2-tags').value.trim(),
    repo: document.getElementById('s2-repo').value.trim(),
    summary: document.getElementById('s2-summary').value.trim(),
    content: document.getElementById('s2-content').value,
  }
}

function saveShowcase() {
  var body = gatherShowcase()
  var req = currentShowcaseSlug
    ? fetch('/api/showcases/' + encodeURIComponent(currentShowcaseSlug), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    : fetch('/api/showcases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  req.then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
    .then(function (x) {
      if (x.ok) { refreshShowcases(); return }
      showcaseError(x.j && x.j.error ? x.j.error : '保存失败')
    })
}

function removeShowcase(slug) {
  if (!confirm('确定删除项目「' + slug + '」？此操作直接删文件，不可撤销。')) return
  fetch('/api/showcases/' + encodeURIComponent(slug), { method: 'DELETE' })
    .then(function () { refreshShowcases() })
}

function closeShowcaseEditor() { refreshShowcases() }

/* ---------- 站点信息 ---------- */

function loadSite() {
  fetch('/api/site').then(function (r) { return r.json() }).then(function (s) {
    document.getElementById('s-name').value = s.name || ''
    document.getElementById('s-intro').value = s.intro || ''
    document.getElementById('s-about').value = (s.about || []).join('\\n')
    var box = document.getElementById('s-links')
    box.innerHTML = ''
    var links = s.links && s.links.length ? s.links : []
    for (var i = 0; i < links.length; i++) addLinkRow(links[i].label, links[i].url)
    if (!links.length) addLinkRow('', '')
    document.getElementById('site-error').style.display = 'none'
  })
}

function addLinkRow(label, url) {
  var div = document.createElement('div')
  div.className = 'linkrow'
  var li = document.createElement('input')
  li.type = 'text'; li.placeholder = '标签，如 GitHub'; li.value = label || ''
  var ul = document.createElement('input')
  ul.type = 'text'; ul.placeholder = 'URL，如 https://github.com/xxx'; ul.value = url || ''
  var rm = document.createElement('button')
  rm.className = 'mini'; rm.textContent = '×'
  rm.onclick = function () { div.remove() }
  div.appendChild(li); div.appendChild(ul); div.appendChild(rm)
  document.getElementById('s-links').appendChild(div)
}

function saveSite() {
  var about = document.getElementById('s-about').value.split(/\\n/).map(function (s) { return s.trim() }).filter(Boolean)
  var links = []
  var rows = document.querySelectorAll('#s-links .linkrow')
  for (var i = 0; i < rows.length; i++) {
    var inputs = rows[i].querySelectorAll('input')
    links.push({ label: inputs[0].value.trim(), url: inputs[1].value.trim() })
  }
  fetch('/api/site', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    name: document.getElementById('s-name').value.trim(),
    intro: document.getElementById('s-intro').value.trim(),
    about: about,
    links: links,
  }) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
    .then(function (x) {
      if (x.ok) { loadSite(); return }
      var el = document.getElementById('site-error')
      el.textContent = x.j && x.j.error ? x.j.error : '保存失败'
      el.style.display = ''
    })
}

refreshPosts()
</script>
</body>
</html>
`

/* ---------- 服务器与路由 ---------- */

/* ---------- 服务器与路由 ---------- */

async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://localhost:' + PORT)
    const parts = url.pathname.split('/').filter(Boolean)
    const method = req.method || 'GET'

    if (method === 'GET' && url.pathname === '/') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(HTML)
      return
    }

    if (parts[0] === 'api' && parts[1] === 'posts') {
      // /api/posts
      if (parts.length === 2) {
        if (method === 'GET') {
          sendJson(res, 200, await listPosts())
          return
        }
        if (method === 'POST') {
          const body = await readJsonBody(req)
          const meta = normalizePostInput(body)
          const slug = SLUG_RE.test(String(body.slug ?? '').trim()) ? String(body.slug).trim().toLowerCase() : autoSlug()
          const file = slugToPath(slug)
          if (await exists(file))
            throw httpError(409, 'slug ' + slug + ' 已存在，请换一个')
          await fs.writeFile(file, buildMarkdown(meta, meta.content), 'utf8')
          sendJson(res, 201, { slug, saved: true })
          return
        }
      }
      // /api/posts/<slug>
      if (parts.length === 3) {
        const slug = decodeURIComponent(parts[2])
        const file = slugToPath(slug)
        if (method === 'GET') {
          const raw = await fs.readFile(file, 'utf8')
          const { meta, body } = parseFrontmatter(raw)
          sendJson(res, 200, {
            slug,
            title: String(meta.title ?? slug),
            date: String(meta.date ?? ''),
            updated: String(meta.updated ?? ''),
            tags: toTags(meta.tags),
            summary: String(meta.summary ?? ''),
            source: String(meta.source ?? ''),
            draft: String(meta.draft ?? '') === 'true',
            content: body,
          })
          return
        }
        if (method === 'PUT') {
          const body = await readJsonBody(req)
          const meta = normalizePostInput(body)
          const prevRaw = await readFileOrNull(file)
          meta.updated = resolveUpdated(prevRaw, meta)
          if (SLUG_RE.test(String(body.slug ?? '').trim()) && body.slug.trim().toLowerCase() !== slug) {
            // 改名场景：写新文件，删旧文件
            const newFile = slugToPath(String(body.slug).trim().toLowerCase())
            if (await exists(newFile))
              throw httpError(409, 'slug ' + body.slug.trim() + ' 已存在')
            await fs.writeFile(newFile, buildMarkdown(meta, meta.content), 'utf8')
            await fs.rm(file)
          }
          else {
            await fs.writeFile(file, buildMarkdown(meta, meta.content), 'utf8')
          }
          sendJson(res, 200, { slug: body.slug ? String(body.slug).trim().toLowerCase() : slug, saved: true })
          return
        }
        if (method === 'DELETE') {
          await fs.rm(file)
          sendJson(res, 200, { deleted: true })
          return
        }
      }
    }

      // /api/showcases（项目集合：字段为 repo，无 draft、无手动排序）
      if (parts[0] === 'api' && parts[1] === 'showcases') {
        if (parts.length === 2) {
          if (method === 'GET') {
            sendJson(res, 200, await listShowcases())
            return
          }
          if (method === 'POST') {
            const body = await readJsonBody(req)
            const meta = normalizeShowcaseInput(body)
            const slug = SLUG_RE.test(String(body.slug ?? '').trim()) ? String(body.slug).trim().toLowerCase() : autoSlug('showcase')
            const file = slugToPathIn(SHOWCASES_DIR, slug)
            if (await exists(file))
              throw httpError(409, 'slug ' + slug + ' 已存在，请换一个')
            await fs.writeFile(file, buildMarkdown(meta, meta.content), 'utf8')
            sendJson(res, 201, { slug, saved: true })
            return
          }
        }
        // /api/showcases/<slug>
        if (parts.length === 3) {
          const slug = decodeURIComponent(parts[2])
          const file = slugToPathIn(SHOWCASES_DIR, slug)
          if (method === 'GET') {
            const raw = await fs.readFile(file, 'utf8')
            const { meta, body } = parseFrontmatter(raw)
            sendJson(res, 200, {
              slug,
              title: String(meta.title ?? slug),
              date: String(meta.date ?? ''),
              tags: toTags(meta.tags),
              summary: String(meta.summary ?? ''),
              repo: String(meta.repo ?? ''),
              content: body,
            })
            return
          }
          if (method === 'PUT') {
            const body = await readJsonBody(req)
            const meta = normalizeShowcaseInput(body)
            if (SLUG_RE.test(String(body.slug ?? '').trim()) && body.slug.trim().toLowerCase() !== slug) {
              // 改名场景：写新文件，删旧文件
              const newFile = slugToPathIn(SHOWCASES_DIR, String(body.slug).trim().toLowerCase())
              if (await exists(newFile))
                throw httpError(409, 'slug ' + body.slug.trim() + ' 已存在')
              await fs.writeFile(newFile, buildMarkdown(meta, meta.content), 'utf8')
              await fs.rm(file)
            }
            else {
              await fs.writeFile(file, buildMarkdown(meta, meta.content), 'utf8')
            }
            sendJson(res, 200, { slug: body.slug ? String(body.slug).trim().toLowerCase() : slug, saved: true })
            return
          }
          if (method === 'DELETE') {
            await fs.rm(file)
            sendJson(res, 200, { deleted: true })
            return
          }
        }
      }

    if (parts[0] === 'api' && parts[1] === 'post-order' && parts.length === 2) {
      if (method === 'GET') {
        sendJson(res, 200, await readOrder())
        return
      }
      if (method === 'PUT') {
        const body = await readJsonBody(req)
        const order = Array.isArray(body?.order) ? body.order.map(String) : null
        if (!order)
          throw httpError(400, 'order 必须是 slug 数组')
        const valid = order.every(s => SLUG_RE.test(s))
        if (!valid)
          throw httpError(400, 'order 数组中包含非法 slug')
        // 忽略不存在的 slug，避免清单腐化
        const names = new Set(
          (await fs.readdir(POSTS_DIR)).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')),
        )
        const cleaned = [...new Set(order)].filter(s => names.has(s))
        await fs.writeFile(ORDER_JSON, JSON.stringify(cleaned, null, 2) + '\n', 'utf8')
        sendJson(res, 200, { saved: true, order: cleaned })
        return
      }
    }

    if (parts[0] === 'api' && parts[1] === 'site' && parts.length === 2) {
      if (method === 'GET') {
        sendJson(res, 200, JSON.parse(await fs.readFile(SITE_JSON, 'utf8')))
        return
      }
      if (method === 'PUT') {
        const site = normalizeSite(await readJsonBody(req))
        await fs.writeFile(SITE_JSON, JSON.stringify(site, null, 2) + '\n', 'utf8')
        sendJson(res, 200, { saved: true })
        return
      }
    }
    sendJson(res, 404, { error: 'not found' })
  }
  catch (err) {
    sendJson(res, err.status ?? 500, { error: err.message || '服务器内部错误' })
  }
}

// 每个监听地址一个 server 实例（Node 的 listen 一次只能绑一个 host），共享同一个 handler
for (const host of HOSTS) {
  const server = createServer(handler)
  server.on('error', (err) => {
    // Tailscale 地址可能因换网失效，127.0.0.1 失败才是致命问题
    console.error('监听 ' + host + ':' + PORT + ' 失败：' + err.message)
  })
  server.listen(PORT, host, () => {
    const label = host === '127.0.0.1'
      ? 'http://127.0.0.1:' + PORT + '（本机）'
      : 'http://' + host + ':' + PORT + '（tailnet）'
    console.log('管理面板监听：' + label)
  })
}
console.log('配合 npm run dev 使用；站点在 http://localhost:5173')
