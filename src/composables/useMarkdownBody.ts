import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref, type WatchSource } from 'vue'

export interface TocItem { id: string; text: string; level: 2 | 3 }

/** 正文扩展（PostPage 与项目案例页共用）：
 * 给渲染后的 .markdown-body 生成 h2/h3 目录（宽屏悬浮，滚动高亮），
 * 并给每个代码块 pre 挂右上角复制按钮。
 * contentTemplate 传页面自己的模板 ref（对应 <div ref="contentBody">），
 * 传入 contentKey（如路由 slug），内容变化时自动重建。 */
export function useMarkdownBody(contentKey: WatchSource<unknown>, contentTemplate: Ref<HTMLElement | undefined>) {
  const toc = ref<TocItem[]>([])
  const activeId = ref('')

  function slugify(text: string): string {
    const base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
    return base || 'section'
  }

  function buildToc(): void {
    nextTick(() => {
      const root = document.querySelector('.markdown-body')
      if (!root || !root.querySelector('h2, h3')) {
        toc.value = []
        return
      }
      const items: TocItem[] = []
      const used = new Map<string, number>()
      ;(Array.from(root.querySelectorAll('h2, h3')) as HTMLElement[]).forEach((el) => {
        const level = el.tagName === 'H2' ? 2 : 3
        const text = (el.textContent ?? '').trim()
        if (!text)
          return
        let id = slugify(text)
        const seen = used.get(id) ?? 0
        used.set(id, seen + 1)
        if (seen)
          id = `${id}-${seen}`
        el.id = id
        items.push({ id, text, level })
      })
      toc.value = items
    })
  }

  // 代码块复制按钮：给正文里每个 pre 挂一个角标按钮
  function decorateCodeBlocks(): void {
    nextTick(() => {
      contentTemplate.value?.querySelectorAll('pre').forEach((pre) => {
        const pre0 = pre as HTMLElement
        if (pre0.querySelector('.copy-btn'))
          return
        const btn = document.createElement('button')
        btn.className = 'copy-btn'
        btn.type = 'button'
        btn.textContent = '复制'
        btn.addEventListener('click', async () => {
          const text = pre0.querySelector('code')?.textContent ?? pre0.textContent ?? ''
          let ok = false
          try {
            await navigator.clipboard.writeText(text)
            ok = true
          }
          catch {
            // 剪贴板 API 不可用（老浏览器/权限受限）时回退到选区复制
            const ta = document.createElement('textarea')
            ta.value = text
            ta.style.position = 'fixed'
            ta.style.opacity = '0'
            document.body.appendChild(ta)
            ta.select()
            ok = document.execCommand('copy')
            ta.remove()
          }
          btn.textContent = ok ? '已复制' : '复制失败'
          setTimeout(() => btn.textContent = '复制', 1500)
        })
        pre0.appendChild(btn)
      })
    })
  }

  function onScroll(): void {
    if (!toc.value.length)
      return
    let current = ''
    for (const item of toc.value) {
      const el = document.getElementById(item.id)
      if (el && el.getBoundingClientRect().top <= 90)
        current = item.id
    }
    activeId.value = current
  }

  /** 点击目录跳转到对应标题（smooth 已由 html 全局配置） */
  function scrollToHeading(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  function refresh(): void {
    buildToc()
    decorateCodeBlocks()
  }

  watch(contentKey, refresh)

  onMounted(() => {
    refresh()
    window.addEventListener('scroll', onScroll, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
  })

  return { toc, activeId, scrollToHeading }
}
