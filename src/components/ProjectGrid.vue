<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { Project } from '../projects'
import { projectStatusLabels } from '../projects'

defineProps<{
  projects: Project[]
}>()
</script>

<template>
  <ul class="project-grid">
    <li v-for="project in projects" :key="project.name" class="project-card">
      <div class="project-head">
        <h3 class="project-name">{{ project.name }}</h3>
        <span
          class="project-status"
          :class="`project-status--${project.status}`"
        >{{ projectStatusLabels[project.status] }}</span>
      </div>
      <p class="project-summary">{{ project.summary }}</p>
      <div v-if="project.tags.length" class="project-tags">
        <span v-for="tag in project.tags" :key="tag" class="project-tag">{{ tag }}</span>
      </div>
      <div v-if="project.repo || project.demo || project.case" class="project-links">
        <RouterLink
          v-if="project.case"
          :to="`/projects/${project.case}`"
        >案例介绍 →</RouterLink>
        <a
          v-if="project.repo"
          :href="project.repo"
          target="_blank"
          rel="noopener noreferrer"
        >GitHub</a>
        <a
          v-if="project.demo"
          :href="project.demo"
          target="_blank"
          rel="noopener noreferrer"
        >在线预览</a>
      </div>
    </li>
  </ul>
</template>
