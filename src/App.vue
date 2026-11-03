<script setup lang="ts">
import { RouterView } from 'vue-router'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
</script>

<template>
  <div class="site">
    <SiteHeader />
    <main class="site-main container">
      <RouterView />
    </main>
    <SiteFooter />
  </div>
</template>
