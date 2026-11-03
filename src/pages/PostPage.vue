<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { getPost, posts } from '../posts'

const props = defineProps<{ slug: string }>()

const post = computed(() => getPost(props.slug))
const index = computed(() => posts.findIndex(p => p.slug === props.slug))
const newer = computed(() => (index.value > 0 ? posts[index.value - 1] : undefined)) // 上一篇（更新）
const older = computed(() => (index.value >= 0 && index.value < posts.length - 1 ? posts[index.value + 1] : undefined)) // 下一篇（更早）
</script>

<template>
  <article v-if="post">
    <header class="post-header">
      <h1 class="post-title">{{ post.title }}</h1>
      <div class="post-meta">
        <time :datetime="post.date">{{ post.date }}</time>
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

    <component :is="post.component" />

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
