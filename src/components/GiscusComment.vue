<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

/*
 * giscus 评论（GitHub Discussions 驱动，免后端免数据库）。
 * 配置参数来自 giscus.app 配置向导（仓库 haoge-works/my-web 已装 giscus App 且开启 Discussions）：
 * 修正 repoId/categoryId 需重走 https://giscus.app/zh-CN 向导。
 * 主题用 preferred_color_scheme 跟随站内深浅模式；mapping=pathname 按页面路径建 discussion。
 */
const GISCUS = {
  repo: 'haoge-works/my-web',
  repoId: 'R_kgDOVhFrjw',
  category: 'Announcements',
  categoryId: 'DIC_kwDOVhFrj84DKhkR',
}

const route = useRoute()
const container = ref<HTMLElement>()
let script: HTMLScriptElement | null = null

function clearWidget() {
  if (container.value)
    container.value.innerHTML = ''
  script = null
}

function bootWidget() {
  if (!container.value)
    return
  clearWidget()
  script = document.createElement('script')
  script.src = 'https://giscus.app/client.js'
  script.async = true
  script.crossOrigin = 'anonymous'
  script.setAttribute('data-repo', GISCUS.repo)
  script.setAttribute('data-repo-id', GISCUS.repoId)
  script.setAttribute('data-category', GISCUS.category)
  script.setAttribute('data-category-id', GISCUS.categoryId)
  script.setAttribute('data-mapping', 'pathname')
  script.setAttribute('data-strict', '0')
  script.setAttribute('data-reactions-enabled', '0')
  script.setAttribute('data-emit-metadata', '0')
  script.setAttribute('data-input-position', 'bottom')
  script.setAttribute('data-theme', 'preferred_color_scheme')
  script.setAttribute('data-lang', 'zh-CN')
  script.setAttribute('data-loading', 'lazy')
  container.value.appendChild(script)
}

// 同一页内 slug 切换（组件实例被复用）时重建 discussion
watch(() => route.fullPath, () => {
  if (container.value)
    bootWidget()
})

onMounted(bootWidget)
onBeforeUnmount(clearWidget)
</script>

<template>
  <section class="comments" aria-label="评论">
    <h2 class="comments-title">评论</h2>
    <div ref="container" class="comments-body" />
  </section>
</template>
