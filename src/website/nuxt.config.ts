export default defineNuxtConfig({
  extends: ['../layers/docs', '../layers/theme'],
  compatibilityDate: '2025-01-01',
  // Project GitHub Pages site: https://jasenmichael.github.io/bros/
  app: {
    baseURL: '/bros/',
  },
  nitro: {
    baseURL: '/bros/',
    prerender: {
      routes: [
        '/',
        '/docs',
        '/docs/getting-started',
        '/docs/sidecars',
        '/docs/configuration',
      ],
    },
  },
  vite: {
    base: '/bros/',
  },
})
