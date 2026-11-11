<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { posts, type Post } from '../posts'
import { showcases, type Showcase } from '../showcases'
import { useMarkdownBody } from '../composables/useMarkdownBody'

/* 阅读器首页：中间默认展示最新内容，列表职能交给左侧常驻索引栏与归档页。
   / 显示「最新的文章或项目案例」（两者按日期取最新）；
   /blog 显示「最新文章」。 */

const route = useRoute()

type Latest = { kind: 'post', item: Post } | { kind: 'case', item: Showcase }

const latest = computed<Latest | null>(() => {
  const p = posts[0]
  if (route.name === 'blog') {
    return p ? { kind: 'post', item: p } : null
  }
  const s = showcases[0]
  if (s && (!p || s.date > p.date)) return { kind: 'case', item: s }
  if (p) return { kind: 'post', item: p }
  return null
})

const kicker = computed(() => (latest.value?.kind === 'post' ? '最新文章' : '最新项目案例'))

/* ---------- TOC + 代码复制按钮：与文章页/案例页共用的 useMarkdownBody ---------- */

const contentBody = ref<HTMLElement>()
const contentKey = computed(() => (latest.value ? `${latest.value.kind}:${latest.value.item.slug}` : 'none'))
const { toc, activeId, scrollToHeading } = useMarkdownBody(contentKey, contentBody)
</script>

<template>
  <article v-if="latest">
    <header class="post-header">
      <p class="latest-kicker">{{ kicker }}</p>
      <h1 class="post-title">{{ latest.item.title }}</h1>
      <div class="post-meta">
        <time :datetime="latest.item.date">{{ latest.item.date }}</time>
        <span class="post-stats">约 {{ latest.item.words }} 字 · {{ latest.item.minutes }} 分钟</span>
        <a
          v-if="latest.kind === 'case' && latest.item.repo"
          :href="latest.item.repo"
          target="_blank"
          rel="noopener noreferrer"
        >GitHub ↗</a>
        <span v-if="latest.item.tags.length" class="article-tags">
          <template v-if="latest.kind === 'post'">
            <RouterLink
              v-for="tag in latest.item.tags"
              :key="tag"
              :to="`/archives?tag=${encodeURIComponent(tag)}`"
              class="tag"
            >#{{ tag }}</RouterLink>
          </template>
          <template v-else>
            <span v-for="tag in latest.item.tags" :key="tag" class="tag">#{{ tag }}</span>
          </template>
        </span>
      </div>
      <p v-if="latest.kind === 'post' && latest.item.source" class="post-source">
        本文转载自
        <a :href="latest.item.source" target="_blank" rel="noopener noreferrer">{{ latest.item.source }}</a>
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
      <component :is="latest.item.component" />
    </div>
  </article>

  <section v-else>
    <h1 class="page-title">还没有内容</h1>
    <p class="empty-hint">站点还没有文章或项目案例。</p>
  </section>
</template>
