<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { posts } from '../posts'

const route = useRoute()
</script>

<template>
  <!-- 两栏阅读器 P0：博客区左侧常驻的文章索引（极简文字流） -->
  <nav class="reader-rail" aria-label="文章索引">
    <p class="reader-rail-title">文章</p>
    <ul>
      <li v-for="p in posts" :key="p.slug">
        <RouterLink
          :to="`/blog/${p.slug}`"
          :class="{ 'reader-rail-link--active': route.name === 'post' && route.params.slug === p.slug }"
        >
          <span class="reader-rail-item-title">{{ p.title }}</span>
          <span class="reader-rail-item-date">{{ p.date }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
