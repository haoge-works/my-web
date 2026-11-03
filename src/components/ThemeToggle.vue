<script setup lang="ts">
import { useTheme } from '../composables/useTheme'

const { cycle, labelText, iconText } = useTheme()
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :title="`当前：${labelText()}，点击切换`"
    :aria-label="`切换主题（当前：${labelText()}）`"
    @click="cycle"
  >
    <span aria-hidden="true" class="theme-toggle-icon">{{ iconText() }}</span>
    <span class="sr-only">{{ labelText() }}</span>
  </button>
</template>
