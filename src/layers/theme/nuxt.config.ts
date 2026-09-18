import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  $meta: {
    name: 'theme',
  },
  compatibilityDate: '2025-01-01',
  modules: ['@nuxt/ui'],
  css: [join(currentDir, './app/assets/css/main.css')],
  ui: {
    colorMode: true,
  },
  components: [
    {
      path: join(currentDir, './app/components'),
    },
    {
      path: join(currentDir, './app/components/content'),
      pathPrefix: false,
      global: true,
    },
  ],
})
