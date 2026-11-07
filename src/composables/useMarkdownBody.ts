import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref, type WatchSource } from 'vue'

export interface TocItem { id: string; text: string; level: 2 | 3 }

/** 正文扩展（PostPage 与项目案例页共用）：
 * 给渲染后的 .markdown-body 生成 h2/h3 目录（宽屏悬浮，滚动高亮），
 * 给每个代码块 pre 挂右上角复制按钮，
 * 并给正文图片挂点击放大查看（lightbox，点击/Esc 关闭）。
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

  /* ---------- 图片点击放大（lightbox） ---------- */

  // 覆盖层是全局单例（正文重复渲染时复用），由路由切换/Esc/点击关闭
  function openLightbox(img: HTMLImageElement): void {
    let overlay = document.querySelector<HTMLElement>('.img-lightbox')
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.className = 'img-lightbox'
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-label', '图片查看')
      const clone = document.createElement('img')
      clone.className = 'img-lightbox-img'
      const caption = document.createElement('p')
      caption.className = 'img-lightbox-caption'
      overlay.appendChild(clone)
      overlay.appendChild(caption)
      overlay.addEventListener('click', closeLightbox)
      document.body.appendChild(overlay)
    }
    const clone = overlay.querySelector('.img-lightbox-img') as HTMLImageElement
    const caption = overlay.querySelector('.img-lightbox-caption') as HTMLElement
    // 用当前加载好的资源（含 srcset 实际选中的那张），未加载完成则退回原图
    clone.src = img.currentSrc || img.src
    clone.alt = img.alt ?? ''
    caption.textContent = img.alt ?? ''
    document.addEventListener('keydown', onLightboxKeydown)
    overlay.classList.add('img-lightbox--open')
  }

  function closeLightbox(): void {
    document.querySelector('.img-lightbox')?.classList.remove('img-lightbox--open')
    document.removeEventListener('keydown', onLightboxKeydown)
  }

  function onLightboxKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape')
      closeLightbox()
  }

  /* 图片挂放大：data-lightbox 标记防重复挂监听 */
  function decorateImages(): void {
    nextTick(() => {
      contentTemplate.value?.querySelectorAll('img').forEach((img) => {
        const el = img as HTMLImageElement
        if (el.dataset.lightbox)
          return
        el.dataset.lightbox = '1'
        el.classList.add('zoomable-img')
        el.addEventListener('click', () => openLightbox(el))
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
    decorateImages()
  }

  watch(contentKey, refresh)

  onMounted(() => {
    refresh()
    window.addEventListener('scroll', onScroll, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    closeLightbox() // 带着放大的图切页时归位防残留
  })

  return { toc, activeId, scrollToHeading }
}
