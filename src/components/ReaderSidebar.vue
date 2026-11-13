<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { posts } from '../posts'
import { showcases } from '../showcases'

const route = useRoute()

/* ---------- 移动端目录抽屉 ----------
   桌面端（≥1200px）rail 常驻，抽屉逻辑不会触发（唤起按钮也是窄屏才显示）；
   窄屏点击头部「目录」按钮 → site:reader 事件切换开合（与 site:search 同款松耦合），
   Esc / 点 backdrop / 路由跳转 都会收起。 */

const open = ref(false)

function toggle(): void {
  open.value = !open.value
}

function close(): void {
  open.value = false
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape')
    close()
}

// 路由变化（点目录里任一项跳转）自动收起抽屉
watch(() => route.fullPath, close)

onMounted(() => {
  window.addEventListener('site:reader', toggle)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('site:reader', toggle)
  window.removeEventListener('keydown', onKeydown)
})

/* 最新内容 slug：首页显示最新文章或项目案例，/blog 显示最新文章，
   侧栏高亮与中间栏展示内容保持对应。 */
const latestPostSlug = posts[0]?.slug ?? ''
// 首页的「最新」是案例还是文章：两者日期取新者
const homeLatestIsCase = (() => {
  const s = showcases[0]
  const p = posts[0]
  return !!s && !!p && s.date > p.date
})()
const homeLatestSlug = (() => {
  const s = showcases[0]
  const p = posts[0]
  if (s && (!p || s.date > p.date)) return s.slug
  return p?.slug ?? ''
})()

function isPostActive(slug: string): boolean {
  if (route.name === 'post') return route.params.slug === slug
  if (route.name === 'home') return !homeLatestIsCase && slug === homeLatestSlug
  if (route.name === 'blog') return slug === latestPostSlug
  return false
}

function isCaseActive(slug: string): boolean {
  return (route.name === 'project-case' && route.params.slug === slug)
    || (route.name === 'home' && homeLatestIsCase && slug === homeLatestSlug)
}
</script>

<template>
  <!-- 移动端抽屉的半透明遮罩：点击任意处关闭（桌面端由 CSS 强制隐藏） -->
  <div v-if="open" class="reader-drawer-backdrop" @click="close" />

  <!-- 全站常驻索引栏：项目 + 文章两组（项目在前），当前项按路由高亮；
       窄屏下由 CSS 变为左侧滑入抽屉（reader-rail--open 控制位移） -->
  <nav
    class="reader-rail"
    :class="{ 'reader-rail--open': open }"
    aria-label="项目与文章索引"
  >
    <p class="reader-rail-title">项目</p>
    <ul>
      <li v-for="s in showcases" :key="s.slug">
        <RouterLink
          :to="`/projects/${s.slug}`"
          :class="{ 'reader-rail-link--active': isCaseActive(s.slug) }"
        >
          <span class="reader-rail-item-title">{{ s.title }}</span>
          <span class="reader-rail-item-date">{{ s.date }}</span>
        </RouterLink>
      </li>
    </ul>

    <p class="reader-rail-title reader-rail-title--gap">文章</p>
    <ul>
      <li v-for="p in posts" :key="p.slug">
        <RouterLink
          :to="`/blog/${p.slug}`"
          :class="{ 'reader-rail-link--active': isPostActive(p.slug) }"
        >
          <span class="reader-rail-item-title">{{ p.title }}</span>
          <span class="reader-rail-item-date">{{ p.date }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
