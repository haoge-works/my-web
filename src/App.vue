<script setup lang="ts">
import { RouterView } from 'vue-router'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import SearchModal from './components/SearchModal.vue'
import ReaderSidebar from './components/ReaderSidebar.vue'
</script>

<template>
  <div class="site">
    <SiteHeader />
    <!-- 两栏阅读器：全站常驻索引栏（文章 + 项目），正文列位置不变；
         窄屏由 CSS 隐藏，移动端维持 M0+M1 成果 -->
    <ReaderSidebar />
    <main class="site-main container">
      <RouterView />
    </main>
    <SiteFooter />
    <SearchModal />
  </div>
</template>
