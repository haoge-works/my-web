<script setup lang="ts">
import { projects } from '../projects'
import ProjectGrid from '../components/ProjectGrid.vue'
</script>

<template>
  <section>
    <header class="page-head">
      <h1 class="page-title">项目</h1>
      <p class="page-subtitle">共 {{ projects.length }} 个项目</p>
    </header>

    <ProjectGrid :projects="projects" />

    <p v-if="!projects.length" class="empty-hint">还没有展示的项目，把项目信息填进 src/projects.json 即可。</p>
  </section>
</template>
