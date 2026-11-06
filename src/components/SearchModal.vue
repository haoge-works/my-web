<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { posts } from '../posts'
import { showcases } from '../showcases'

interface SearchEntry {
  type: 'post' | 'case'
  slug: string
  title: string
  summary: string
  tags: string[]
  date: string
  body: string
}

const router = useRouter()
const route = useRoute()

const open = ref(false)
const query = ref('')
const loading = ref(false)
const indexFailed = ref(false)
const inputEl = ref<HTMLInputElement>()
const activeIdx = ref(0)

/* 构建期索引（gen-feed.mjs 生成 dist/search-index.json），首次打开时惰性拉取 */
let remoteIndex: SearchEntry[] | null = null

// 索引拉取失败 / 还没拉到时，退化为标题 + 摘要 + 标签搜索（数据本来就在 bundle 里）
const localEntries = computed<SearchEntry[]>(() => [
  ...posts.map(p => ({ type: 'post' as const, slug: p.slug, title: p.title, summary: p.summary, tags: p.tags, date: p.date, body: '' })),
  ...showcases.map(s => ({ type: 'case' as const, slug: s.slug, title: s.title, summary: s.summary, tags: s.tags, date: s.date, body: '' })),
])

const entries = computed(() => remoteIndex ?? localEntries.value)

/* 打开 / 关闭 */

async function openModal() {
  open.value = true
  activeIdx.value = 0
  if (remoteIndex === null && !indexFailed.value && !loading.value)
    void loadIndex()
  // 等 fetch 让出主循环后聚焦（若正在加载则聚焦会打断 v-if 渲染节奏，直接聚焦即可）
  inputEl.value?.focus()
}

function closeModal() {
  open.value = false
  query.value = ''
}

async function loadIndex() {
  loading.value = true
  try {
    const res = await fetch('/search-index.json')
    if (!res.ok)
      throw new Error(String(res.status))
    remoteIndex = (await res.json()) as SearchEntry[]
  }
  catch {
    indexFailed.value = true // 退化用本地数据
  }
  finally {
    loading.value = false
  }
}

/* 键盘事件：全局 Ctrl/⌘+K 唤起，弹窗内 ↑↓ Enter Esc */
function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value ? closeModal() : openModal()
  }
}

function onGlobalSearch() {
  openModal()
}

function onSubmit() {
  const hit = results.value[activeIdx.value]
  if (!hit)
    return
  router.push(hit.type === 'post' ? `/blog/${hit.slug}` : `/projects/${hit.slug}`)
  closeModal()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeModal()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = (activeIdx.value + 1) % Math.max(results.value.length, 1)
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = (activeIdx.value - 1 + results.value.length) % Math.max(results.value.length, 1)
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    onSubmit()
  }
}

/* 检索：全词匹配 AND，标题 > 标签 > 摘要 > 正文 的权重排序 */

const results = computed<SearchEntry[]>(() => {
  const tokens = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length)
    return []
  const scored: { entry: SearchEntry; score: number }[] = []
  for (const entry of entries.value) {
    const title = entry.title.toLowerCase()
    const tags = entry.tags.join(' ').toLowerCase()
    const summary = entry.summary.toLowerCase()
    const body = entry.body.toLowerCase()
    let score = 0
    let allHit = true
    for (const t of tokens) {
      let s = 0
      if (title.includes(t))
        s += 300
      if (tags.includes(t))
        s += 100
      if (summary.includes(t))
        s += 50
      if (body.includes(t))
        s += 10
      if (s === 0) {
        allHit = false
        break
      }
      score += s
    }
    if (allHit)
      scored.push({ entry, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date))
    .slice(0, 10)
    .map(x => x.entry)
})

watch(query, () => { activeIdx.value = 0 })
// 跳转后弹窗归位（App 级组件常驻，路由变化时统一关闭）
watch(() => route.fullPath, () => { if (open.value) closeModal() })

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('site:search', onGlobalSearch)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('site:search', onGlobalSearch)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="search-overlay" @click.self="closeModal">
      <div class="search-modal" role="dialog" aria-label="站内搜索">
        <input
          ref="inputEl"
          v-model="query"
          class="search-input"
          type="search"
          placeholder="搜索文章、项目…"
          aria-label="搜索关键字"
          autocomplete="off"
          @keydown="onKeydown"
        >
        <ul v-if="results.length" class="search-results">
          <li
            v-for="(r, i) in results"
            :key="`${r.type}-${r.slug}`"
            :class="['search-item', { 'search-item--active': i === activeIdx }]"
            @mousemove="activeIdx = i"
          >
            <RouterLink :to="r.type === 'post' ? `/blog/${r.slug}` : `/projects/${r.slug}`" @click="closeModal">
              <span class="search-item-type">{{ r.type === 'post' ? '文章' : '项目' }}</span>
              <span class="search-item-main">
                <span class="search-item-title">{{ r.title }}</span>
                <span v-if="r.tags.length" class="search-item-tags">#{{ r.tags.join(' #') }}</span>
              </span>
              <span class="search-item-date">{{ r.date }}</span>
            </RouterLink>
          </li>
        </ul>
        <p v-else-if="loading && remoteIndex === null" class="search-hint">正在加载搜索索引…</p>
        <p v-else-if="query.trim()" class="search-hint">
          没有找到「{{ query.trim() }}」相关内容
        </p>
        <p v-else class="search-hint search-hint--dim">
          支持按标题、标签与正文内容搜索 · Enter 跳转 · Esc 关闭
        </p>
      </div>
    </div>
  </Teleport>
</template>
