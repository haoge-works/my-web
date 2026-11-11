<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { posts } from '../posts'

/* 归档 = 全站编年索引；支持 /archives?tag=xx 直达标签筛选
   （原博客列表页的标签职能迁移至此，侧栏为常驻索引）。 */

const route = useRoute()
const activeTag = computed(() => String(route.query.tag ?? ''))

const allTags = computed(() => [...new Set(posts.flatMap(p => p.tags))])
const filtered = computed(() =>
  activeTag.value
    ? posts.filter(p => p.tags.includes(activeTag.value))
    : posts,
)

const years = computed(() => {
  const groups = new Map<string, typeof posts>()
  for (const p of filtered.value) {
    const year = p.date.slice(0, 4) || '未知'
    if (!groups.has(year))
      groups.set(year, [])
    groups.get(year)!.push(p)
  }
  return [...groups.entries()].map(([year, items]) => ({ year, items }))
})
</script>

<template>
  <section>
    <header class="page-head">
      <h1 class="page-title">归档</h1>
      <p class="page-subtitle">共 {{ filtered.length }} 篇文章{{ activeTag ? ` · #${activeTag}` : '，按时间倒序' }}</p>
    </header>

    <div v-if="allTags.length" class="tag-filter">
      <RouterLink
        class="tag-filter-btn"
        :class="{ 'tag-filter-btn--active': !activeTag }"
        to="/archives"
      >全部</RouterLink>
      <RouterLink
        v-for="tag in allTags"
        :key="tag"
        class="tag-filter-btn"
        :class="{ 'tag-filter-btn--active': activeTag === tag }"
        :to="`/archives?tag=${encodeURIComponent(tag)}`"
      ># {{ tag }}</RouterLink>
    </div>

    <div v-for="group in years" :key="group.year">
      <h2 class="archive-year">{{ group.year }}</h2>
      <ul class="archive-list">
        <li v-for="post in group.items" :key="post.slug" class="archive-item">
          <span class="archive-date">{{ post.date.slice(5) || '—' }}</span>
          <RouterLink :to="`/blog/${post.slug}`" class="archive-title">{{ post.title }}</RouterLink>
        </li>
      </ul>
    </div>

    <p v-if="!filtered.length" class="empty-hint">这个标签下暂时还没有文章。</p>
  </section>
</template>
