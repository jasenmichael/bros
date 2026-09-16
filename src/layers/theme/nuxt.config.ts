import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  modules: ['@nuxt/ui', '@nuxt/content'],
  css: [join(currentDir, './app/assets/css/main.css')],
  ui: {
    colorMode: true
  },
  content: {
    experimental: {
      nativeSqlite: true
    }
  },
})
