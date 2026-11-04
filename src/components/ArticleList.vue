<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { Post } from '../posts'

defineProps<{
  posts: Post[]
  /** 显示日期文字的占位（列表省略日期时可隐藏） */
  showSummary?: boolean
}>()
</script>

<template>
  <ul class="article-list">
    <li v-for="post in posts" :key="post.slug" class="article-item">
      <RouterLink :to="`/blog/${post.slug}`" class="article-link">
        <span class="article-title">{{ post.title }}</span>
        <p v-if="showSummary && post.summary" class="article-summary">{{ post.summary }}</p>
      </RouterLink>
      <div class="article-meta">
        <time :datetime="post.date" class="article-date">{{ post.date }}</time>
        <span class="article-words">{{ post.minutes }} 分钟</span>
        <span v-if="post.tags.length" class="article-tags">
          <RouterLink
            v-for="tag in post.tags"
            :key="tag"
            :to="`/blog?tag=${encodeURIComponent(tag)}`"
            class="tag"
            @click.stop
          >#{{ tag }}</RouterLink>
        </span>
      </div>
    </li>
  </ul>
</template>
