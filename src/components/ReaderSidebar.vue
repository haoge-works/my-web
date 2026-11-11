<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { posts } from '../posts'
import { showcases } from '../showcases'

const route = useRoute()
</script>

<template>
  <!-- 全站常驻索引栏：文章 + 项目两组，当前项按路由高亮 -->
  <nav class="reader-rail" aria-label="文章与项目索引">
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

    <p class="reader-rail-title reader-rail-title--gap">项目</p>
    <ul>
      <li v-for="s in showcases" :key="s.slug">
        <RouterLink
          :to="`/projects/${s.slug}`"
          :class="{ 'reader-rail-link--active': route.name === 'project-case' && route.params.slug === s.slug }"
        >
          <span class="reader-rail-item-title">{{ s.title }}</span>
          <span class="reader-rail-item-date">{{ s.date }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
