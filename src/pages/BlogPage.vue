<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { posts } from '../posts'
import ArticleList from '../components/ArticleList.vue'

const route = useRoute()

// 当前选中的标签（空字符串 = 全部），支持 /blog?tag=技术 直达
const activeTag = ref(String(route.query.tag ?? ''))
watch(
  () => route.query.tag,
  (tag) => {
    activeTag.value = String(tag ?? '')
  },
)

const allTags = computed(() => [...new Set(posts.flatMap(p => p.tags))])
const filtered = computed(() =>
  activeTag.value
    ? posts.filter(p => p.tags.includes(activeTag.value))
    : posts,
)
</script>

<template>
  <section>
    <header class="page-head">
      <h1 class="page-title">博客</h1>
      <p class="page-subtitle">共 {{ posts.length }} 篇文章</p>
    </header>

    <div v-if="allTags.length" class="tag-filter">
      <button
        type="button"
        class="tag-filter-btn"
        :class="{ 'tag-filter-btn--active': !activeTag }"
        @click="activeTag = ''"
      >全部</button>
      <button
        v-for="tag in allTags"
        :key="tag"
        type="button"
        class="tag-filter-btn"
        :class="{ 'tag-filter-btn--active': activeTag === tag }"
        @click="activeTag = activeTag === tag ? '' : tag"
      ># {{ tag }}</button>
    </div>

    <ArticleList :posts="filtered" show-summary />

    <p v-if="!filtered.length" class="empty-hint">这个标签下暂时还没有文章。</p>
  </section>
</template>
