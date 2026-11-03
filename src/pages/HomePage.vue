<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { site } from '../site'
import { posts } from '../posts'
import ArticleList from '../components/ArticleList.vue'

const latestPosts = posts.slice(0, 5)
</script>

<template>
  <section>
    <div class="hero">
      <h1 class="hero-title">{{ site.name }}</h1>
      <p class="hero-intro">{{ site.intro }}</p>
      <div class="hero-links">
        <a v-for="link in site.links" :key="link.label" :href="link.url" target="_blank" rel="noopener noreferrer">
          {{ link.label }}
        </a>
      </div>
    </div>

    <section class="home-posts">
      <div class="section-head">
        <h2 class="section-title">最新文章</h2>
        <RouterLink to="/blog" class="more-link">全部文章 →</RouterLink>
      </div>
      <ArticleList :posts="latestPosts" />
    </section>
  </section>
</template>
