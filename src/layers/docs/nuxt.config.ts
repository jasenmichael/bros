export default defineNuxtConfig({
  $meta: {
    name: 'docs',
  },
  compatibilityDate: '2025-01-01',
  modules: ['@nuxt/content'],
  content: {
    experimental: {
      nativeSqlite: true,
    },
  },
})
