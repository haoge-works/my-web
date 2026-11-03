import { ref } from 'vue'

export type ThemeMode = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'theme'

const LABELS: Record<ThemeMode, string> = {
  auto: '跟随系统',
  light: '浅色模式',
  dark: '深色模式',
}

const ICONS: Record<ThemeMode, string> = {
  auto: '◐',
  light: '☀',
  dark: '☾',
}

function readInitialMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'auto'
}

function isDark(m: ThemeMode): boolean {
  if (m === 'dark')
    return true
  if (m === 'light')
    return false
  return systemDark.matches
}

function apply(m: ThemeMode) {
  document.documentElement.classList.toggle('dark', isDark(m))
}

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
systemDark.addEventListener('change', () => {
  // 「跟随系统」模式下，系统切换明暗时站点同步切换
  if (mode.value === 'auto')
    apply('auto')
})

const mode = ref<ThemeMode>(readInitialMode())
apply(mode.value)

function cycle() {
  const order: ThemeMode[] = ['auto', 'light', 'dark']
  mode.value = order[(order.indexOf(mode.value) + 1) % order.length]
  localStorage.setItem(STORAGE_KEY, mode.value)
  apply(mode.value)
}

export function useTheme() {
  return {
    mode,
    cycle,
    labelText: () => LABELS[mode.value],
    iconText: () => ICONS[mode.value],
  }
}
