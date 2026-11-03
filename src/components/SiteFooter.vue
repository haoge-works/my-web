<script setup lang="ts">
import { site } from '../site'

const year = new Date().getFullYear()
</script>

<template>
  <footer class="site-footer">
    <div class="container">
      <p>© {{ year }} {{ site.name }} · 用 Vue 3 手工搭建 · 极简主义</p>
    </div>
  </footer>
</template>
