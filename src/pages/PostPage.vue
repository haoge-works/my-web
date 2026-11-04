<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getPost, posts } from '../posts'

const props = defineProps<{ slug: string }>()

const post = computed(() => getPost(props.slug))
const index = computed(() => posts.findIndex(p => p.slug === props.slug))
const newer = computed(() => (index.value > 0 ? posts[index.value - 1] : undefined)) // 上一篇（更新）
const older = computed(() => (index.value >= 0 && index.value < posts.length - 1 ? posts[index.value + 1] : undefined)) // 下一篇（更早）

/* ---------- 文章目录 TOC：从渲染后的 DOM 提取 h2/h3，滚动高亮 ---------- */

interface TocItem { id: string; text: string; level: 2 | 3 }
const toc = ref<TocItem[]>([])
const activeId = ref('')

function slugify(text: string): string {
  const base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return base || 'section'
}

function buildToc(): void {
  if (!post.value)
    return
  nextTick(() => {
    const root = document.querySelector('.markdown-body')
    if (!root || !root.querySelector('h2, h3')) {
      toc.value = []
      return
    }
    const items: TocItem[] = []
    const used = new Map<string, number>()
    ;(Array.from(root.querySelectorAll('h2, h3')) as HTMLElement[]).forEach((el) => {
      const level = el.tagName === 'H2' ? 2 : 3
      const text = (el.textContent ?? '').trim()
      if (!text)
        return
      let id = slugify(text)
      const seen = used.get(id) ?? 0
      used.set(id, seen + 1)
      if (seen)
        id = `${id}-${seen}`
      el.id = id
      items.push({ id, text, level })
    })
    toc.value = items
  })
}

function onScroll(): void {
  if (!toc.value.length)
    return
  let current = ''
  for (const item of toc.value) {
    const el = document.getElementById(item.id)
    if (el && el.getBoundingClientRect().top <= 90)
      current = item.id
  }
  activeId.value = current
}

/** 点击目录跳转到对应标题（smooth 已由 html 全局配置） */
function scrollToHeading(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

const contentBody = ref<HTMLElement>()

// 代码块复制按钮：给正文里每个 pre 挂一个角标按钮
function decorateCodeBlocks(): void {
  nextTick(() => {
    contentBody.value?.querySelectorAll('pre').forEach((pre) => {
      const pre0 = pre as HTMLElement
      if (pre0.querySelector('.copy-btn'))
        return
      const btn = document.createElement('button')
      btn.className = 'copy-btn'
      btn.type = 'button'
      btn.textContent = '复制'
      btn.addEventListener('click', async () => {
        const text = pre0.querySelector('code')?.textContent ?? pre0.textContent ?? ''
        let ok = false
        try {
          await navigator.clipboard.writeText(text)
          ok = true
        }
        catch {
          // 剪贴板 API 不可用（老浏览器/权限受限）时回退到选区复制
          const ta = document.createElement('textarea')
          ta.value = text
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.select()
          ok = document.execCommand('copy')
          ta.remove()
        }
        btn.textContent = ok ? '已复制' : '复制失败'
        setTimeout(() => btn.textContent = '复制', 1500)
      })
      pre0.appendChild(btn)
    })
  })
}

watch(() => props.slug, () => {
  buildToc()
  decorateCodeBlocks()
})

onMounted(() => {
  buildToc()
  decorateCodeBlocks()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <article v-if="post">
    <header class="post-header">
      <p class="post-back"><RouterLink to="/blog">← 返回文章列表</RouterLink></p>
      <h1 class="post-title">{{ post.title }}</h1>
      <div class="post-meta">
        <time :datetime="post.date">{{ post.date }}</time>
        <span class="post-stats">约 {{ post.words }} 字 · {{ post.minutes }} 分钟</span>
        <span v-if="post.tags.length" class="article-tags">
          <RouterLink
            v-for="tag in post.tags"
            :key="tag"
            :to="`/blog?tag=${encodeURIComponent(tag)}`"
            class="tag"
          >#{{ tag }}</RouterLink>
        </span>
      </div>
      <p v-if="post.source" class="post-source">
        本文转载自
        <a :href="post.source" target="_blank" rel="noopener noreferrer">{{ post.source }}</a>
        ，版权归原作者所有。
      </p>
    </header>

    <aside v-if="toc.length > 1" class="toc" aria-label="文章目录">
      <p class="toc-title">目录</p>
      <ul>
        <li v-for="item in toc" :key="item.id" :class="[`toc-item--h${item.level}`, { 'toc-item--active': item.id === activeId }]">
          <a :href="`#${item.id}`" @click.prevent="scrollToHeading(item.id)">{{ item.text }}</a>
        </li>
      </ul>
    </aside>

    <div ref="contentBody">
      <component :is="post.component" />
    </div>

    <nav class="post-nav" aria-label="文章导航">
      <RouterLink v-if="older" :to="`/blog/${older.slug}`" class="post-nav-link">
        <span class="post-nav-label">← 上一篇</span>
        <span class="post-nav-title">{{ older.title }}</span>
      </RouterLink>
      <span v-else />
      <RouterLink v-if="newer" :to="`/blog/${newer.slug}`" class="post-nav-link post-nav-link--right">
        <span class="post-nav-label">下一篇 →</span>
        <span class="post-nav-title">{{ newer.title }}</span>
      </RouterLink>
      <span v-else />
    </nav>

    <p class="back-link"><RouterLink to="/blog">← 返回文章列表</RouterLink></p>
  </article>

  <section v-else>
    <h1 class="page-title">文章不存在</h1>
    <p class="empty-hint">没有找到「{{ slug }}」这篇文章，<RouterLink to="/blog">去博客列表看看</RouterLink>。</p>
  </section>
</template>
