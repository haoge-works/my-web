<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { getPost, posts } from '../posts'
import { findRelated } from '../related'
import GiscusComment from '../components/GiscusComment.vue'
import { useMarkdownBody } from '../composables/useMarkdownBody'

const props = defineProps<{ slug: string }>()

const post = computed(() => getPost(props.slug))
const index = computed(() => posts.findIndex(p => p.slug === props.slug))
const newer = computed(() => (index.value > 0 ? posts[index.value - 1] : undefined)) // 上一篇（更新）
const older = computed(() => (index.value >= 0 && index.value < posts.length - 1 ? posts[index.value + 1] : undefined)) // 下一篇（更早）

/* 相关文章：tags 交集数排序取前 3，无交集则为空（模板隐藏区块） */
const related = computed(() => (post.value ? findRelated(post.value, posts, 3) : []))

/* ---------- TOC + 代码复制按钮：与项目案例页共用的 useMarkdownBody ---------- */

const contentBody = ref<HTMLElement>()
const { toc, activeId, scrollToHeading } = useMarkdownBody(() => props.slug, contentBody)
</script>

<template>
  <article v-if="post">
    <header class="post-header">
      <p class="post-back"><RouterLink to="/archives">← 返回归档</RouterLink></p>
      <h1 class="post-title">{{ post.title }}</h1>
      <div class="post-meta">
        <time :datetime="post.date">{{ post.date }}</time>
        <span v-if="post.updated && post.updated !== post.date" class="post-updated">最后更新 {{ post.updated }}</span>
        <span class="post-stats">约 {{ post.words }} 字 · {{ post.minutes }} 分钟</span>
        <span v-if="post.tags.length" class="article-tags">
          <RouterLink
            v-for="tag in post.tags"
            :key="tag"
            :to="`/archives?tag=${encodeURIComponent(tag)}`"
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

    <section v-if="related.length" class="related-posts" aria-label="相关文章">
      <h2 class="related-title">相关文章</h2>
      <ul class="related-list">
        <li v-for="r in related" :key="r.slug" class="related-item">
          <RouterLink :to="`/blog/${r.slug}`">
            <span class="related-item-title">{{ r.title }}</span>
            <span class="related-item-meta">{{ r.date }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <GiscusComment v-if="post" />

    <p class="back-link"><RouterLink to="/archives">← 返回归档</RouterLink></p>
  </article>

  <section v-else>
    <h1 class="page-title">文章不存在</h1>
    <p class="empty-hint">没有找到「{{ slug }}」这篇文章，<RouterLink to="/archives">去归档看看</RouterLink>。</p>
  </section>
</template>
