<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { posts } from '../posts'

// 按标签归组：沿用 posts 现有排序（手动排序+日期倒序），保持全站一致
const tagGroups = computed(() => {
  const groups = new Map<string, typeof posts>()
  for (const p of posts) {
    for (const tag of p.tags) {
      if (!groups.has(tag))
        groups.set(tag, [])
      groups.get(tag)!.push(p)
    }
  }
  // 标签按文章数多者在前，数量相同按标签名排序
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh'))
    .map(([tag, items]) => ({ tag, items }))
})

const tagCount = computed(() => tagGroups.value.length)
</script>

<template>
  <section>
    <header class="page-head">
      <h1 class="page-title">标签</h1>
      <p class="page-subtitle">共 {{ tagCount }} 个标签、{{ posts.length }} 篇文章，按标签归组</p>
    </header>

    <div v-for="group in tagGroups" :key="group.tag" class="tag-group">
      <h2 class="tags-heading">
        <RouterLink :to="`/blog?tag=${encodeURIComponent(group.tag)}`">#{{ group.tag }}</RouterLink>
        <span class="tags-count">{{ group.items.length }}</span>
      </h2>
      <ul class="archive-list">
        <li v-for="post in group.items" :key="post.slug" class="archive-item">
          <span class="archive-date">{{ post.date.slice(5) || '—' }}</span>
          <RouterLink :to="`/blog/${post.slug}`" class="archive-title">{{ post.title }}</RouterLink>
        </li>
      </ul>
    </div>

    <p v-if="!tagGroups.length" class="empty-hint">还没有带标签的文章。</p>
  </section>
</template>
