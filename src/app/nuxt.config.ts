import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function betterSqlite3Entry() {
  try {
    return require.resolve('better-sqlite3')
  } catch {
    return 'better-sqlite3'
  }
}

export default defineNuxtConfig({
  // docs layer extends theme + Nuxt Content; app overrides homepage/nav
  extends: ['@bros/docs'],
  compatibilityDate: '2025-01-01',
  // Vue app package root; Nitro lives in sibling src/server
  srcDir: '.',
  serverDir: '../server',
  dir: {
    public: 'public',
  },
  devServer: {
    host: '0.0.0.0',
    port: 3055,
  },
  runtimeConfig: {
    brosWorkingDir: process.env.BROS_WORKING_DIR || '',
    brosDataDir: process.env.BROS_DATA_DIR || '',
    brosConfig: process.env.BROS_CONFIG || '',
    brosSidecarsDir: process.env.BROS_SIDECARS_DIR || '',
    brosNetwork: process.env.BROS_NETWORK || 'bros',
    sessionSecret: process.env.BROS_SESSION_SECRET || 'bros-dev-secret-change-me',
    public: {
      appName: 'Bros',
    },
  },
  nitro: {
    experimental: {
      websocket: true,
    },
    externals: {
      // Resolve from the workspace — a bare name is treated as src/app/better-sqlite3.
      traceInclude: [betterSqlite3Entry()],
    },
  },
  vite: {
    server: {
      watch: {
        usePolling: true,
      },
    },
  },
  alias: {
    '#bros': join(currentDir, '../server/utils'),
  },
})
