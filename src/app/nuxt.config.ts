import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { brosDevCssSplitPlugin, installBrosDevCssSplit } from './vite/devCssSplit'

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
  // theme + docs layers; this app overrides `/` with the dashboard
  extends: ['../layers/docs', '../layers/theme'],
  compatibilityDate: '2025-01-01',
  // Vue app package root; Nitro lives in sibling src/server
  srcDir: '.',
  serverDir: '../server',
  devtools: false,
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
  hooks: {
    'vite:serverCreated'(server) {
      if (process.env.NODE_ENV === 'production') return
      installBrosDevCssSplit(server)
    },
  },
  vite: {
    plugins: [brosDevCssSplitPlugin()],
    server: {
      // Dev via Cloudflare tunnel / public_url host (Vite 6+ blocks unknown Host by default).
      allowedHosts: true,
      headers: {
        'Cache-Control': 'no-store, no-transform',
        'CDN-Cache-Control': 'no-store',
        'Cloudflare-CDN-Cache-Control': 'no-store',
      },
      watch: {
        usePolling: true,
      },
    },
  },
  alias: {
    '#bros': join(currentDir, '../server/utils'),
  },
})
