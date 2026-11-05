<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { getShowcase } from '../showcases'
import { useMarkdownBody } from '../composables/useMarkdownBody'

const props = defineProps<{ slug: string }>()

const showcase = computed(() => getShowcase(props.slug))

/* ---------- TOC + 代码复制按钮：与 PostPage 共用 ---------- */
const contentBody = ref<HTMLElement>()
const { toc, activeId, scrollToHeading } = useMarkdownBody(() => props.slug, contentBody)
</script>

<template>
  <article v-if="showcase">
    <header class="post-header">
      <p class="post-back"><RouterLink to="/projects">← 返回项目列表</RouterLink></p>
      <h1 class="post-title">{{ showcase.title }}</h1>
      <div class="post-meta">
        <time :datetime="showcase.date">{{ showcase.date }}</time>
        <span class="post-stats">约 {{ showcase.words }} 字 · {{ showcase.minutes }} 分钟</span>
        <a
          v-if="showcase.repo"
          :href="showcase.repo"
          target="_blank"
          rel="noopener noreferrer"
        >GitHub ↗</a>
        <span v-if="showcase.tags.length" class="article-tags">
          <span v-for="tag in showcase.tags" :key="tag" class="tag">#{{ tag }}</span>
        </span>
      </div>
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
      <component :is="showcase.component" />
    </div>

    <p class="back-link"><RouterLink to="/projects">← 返回项目列表</RouterLink></p>
  </article>

  <section v-else>
    <h1 class="page-title">项目不存在</h1>
    <p class="empty-hint">没有找到「{{ slug }}」的项目介绍，<RouterLink to="/projects">去项目列表看看</RouterLink>。</p>
  </section>
</template>
