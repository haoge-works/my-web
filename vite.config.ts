import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Markdown from 'unplugin-vue-markdown/vite'
import markdownItShiki from '@shikijs/markdown-it'

export default defineConfig({
  // 部署到 GitHub Pages 子路径时改为 '/my-web/'
  base: '/',
  plugins: [
    Markdown({
      wrapperClasses: 'markdown-body',
      // Shiki 高亮器是异步创建的，异步安装插件
      markdownSetup: async (md) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(md as any).use(await markdownItShiki({
          // 构建期高亮，浅色 / 深色双主题
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        }))
      },
    }),
    Vue({ include: [/\.vue$/, /\.md$/] }),
  ],
})
