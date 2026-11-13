<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { site } from '../site'
import ThemeToggle from './ThemeToggle.vue'

/* 唤起全局搜索弹窗（SearchModal 监听 window 的 site:search 事件，松耦合） */
function onSearchClick() {
  window.dispatchEvent(new CustomEvent('site:search'))
}

/* 唤起/收起移动端目录抽屉（ReaderSidebar 监听 site:reader，松耦合；桌面端侧栏常驻，按钮隐藏） */
function onReaderClick() {
  window.dispatchEvent(new CustomEvent('site:reader'))
}
</script>

<template>
  <header class="site-header">
    <div class="container header-inner">
      <RouterLink to="/" class="brand">{{ site.name }} --- </RouterLink>
      <nav class="nav" aria-label="主导航">
        <RouterLink to="/" class="nav-link" exact-active-class="nav-link--active">首页</RouterLink>
        <RouterLink to="/blog" class="nav-link" exact-active-class="nav-link--active">博客</RouterLink>
        <RouterLink to="/projects" class="nav-link" exact-active-class="nav-link--active">项目</RouterLink>
        <RouterLink to="/archives" class="nav-link" exact-active-class="nav-link--active">归档</RouterLink>
        <RouterLink to="/tags" class="nav-link" exact-active-class="nav-link--active">标签</RouterLink>
        <RouterLink to="/about" class="nav-link" exact-active-class="nav-link--active">关于</RouterLink>
      </nav>
      <button
        class="search-btn reader-toggle"
        type="button"
        aria-label="文章目录"
        title="文章与项目目录"
        @click="onReaderClick"
      >目录</button>
      <button
        class="search-btn"
        type="button"
        aria-label="搜索"
        title="搜索（Ctrl+K）"
        @click="onSearchClick"
      >搜索</button>
      <ThemeToggle />
    </div>
  </header>
</template>
