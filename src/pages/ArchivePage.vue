<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { posts } from '../posts'

// 按年分组的时间线（沿用站点当前排序，保持全站一致）
const years = computed(() => {
  const groups = new Map<string, typeof posts>()
  for (const p of posts) {
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
      <p class="page-subtitle">共 {{ posts.length }} 篇文章，按年份排列</p>
    </header>

    <div v-for="group in years" :key="group.year">
      <h2 class="archive-year">{{ group.year }}</h2>
      <ul class="archive-list">
        <li v-for="post in group.items" :key="post.slug" class="archive-item">
          <span class="archive-date">{{ post.date.slice(5) || '—' }}</span>
          <RouterLink :to="`/blog/${post.slug}`" class="archive-title">{{ post.title }}</RouterLink>
        </li>
      </ul>
    </div>

    <p v-if="!posts.length" class="empty-hint">还没有文章。</p>
  </section>
</template>
