<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import SearchModal from './components/SearchModal.vue'
import ReaderSidebar from './components/ReaderSidebar.vue'

const route = useRoute()
// 两栏阅读器（P0）：博客列表/文章页左侧挂常驻文章索引。
// 正文列位置不变（TOC 锚定视口中心的定位逻辑保持原样）；
// 窄屏由 CSS 隐藏侧栏，移动端维持 M0+M1 成果。
const showReaderRail = computed(() => route.name === 'blog' || route.name === 'post')
</script>

<template>
  <div class="site">
    <SiteHeader />
    <ReaderSidebar v-if="showReaderRail" />
    <main class="site-main container">
      <RouterView />
    </main>
    <SiteFooter />
    <SearchModal />
  </div>
</template>
