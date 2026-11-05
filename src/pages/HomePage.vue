<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { site } from '../site'
import { posts } from '../posts'
import { projects } from '../projects'
import ArticleList from '../components/ArticleList.vue'
import ProjectGrid from '../components/ProjectGrid.vue'

const latestPosts = posts.slice(0, 5)
const showcaseProjects = projects.slice(0, 4)
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

    <section v-if="showcaseProjects.length" class="home-projects">
      <div class="section-head">
        <h2 class="section-title">我的项目</h2>
        <RouterLink to="/projects" class="more-link">全部项目 →</RouterLink>
      </div>
      <ProjectGrid :projects="showcaseProjects" />
    </section>

    <section class="home-posts">
      <div class="section-head">
        <h2 class="section-title">最新文章</h2>
        <RouterLink to="/blog" class="more-link">全部文章 →</RouterLink>
      </div>
      <ArticleList :posts="latestPosts" />
    </section>
  </section>
</template>
