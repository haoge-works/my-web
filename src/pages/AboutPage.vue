<script setup lang="ts">
import { site } from '../site'
</script>

<template>
  <section>
    <header class="page-head">
      <h1 class="page-title">关于</h1>
    </header>

    <div class="about">
      <p v-for="(paragraph, i) in site.about" :key="i" class="about-paragraph">{{ paragraph }}</p>

      <h2 class="section-title">联系方式</h2>
      <ul class="about-links">
        <li v-for="link in site.links" :key="link.label">
          <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.label }}：{{ link.url }}</a>
        </li>
      </ul>
    </div>
  </section>
</template>
