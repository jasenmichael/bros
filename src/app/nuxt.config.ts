import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { brosDevCssSplitPlugin, installBrosDevCssSplit } from './vite/devCssSplit'

const currentDir = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function dotenvKeys(file: string, keys: string[]): Map<string, string> {
  const found = new Map<string, string>()
  if (!existsSync(file)) return found
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    if (!keys.includes(key) || found.has(key)) continue
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (value) found.set(key, value)
  }
  return found
}

function fillListenEnv(key: string, fallback: string, fromFile: Map<string, string>): string {
  const current = process.env[key]?.trim()
  if (current) return current
  const value = fromFile.get(key) || fallback
  process.env[key] = value
  return value
}

const listenFile = dotenvKeys(join(currentDir, '../../.env'), ['BROS_PORT', 'BROS_HOST'])
const brosPort = Number(fillListenEnv('BROS_PORT', '3055', listenFile)) || 3055
const brosHost = fillListenEnv('BROS_HOST', '127.0.0.1', listenFile)
const inContainer = (process.env.BROS_DIR || '').trim() === '/app'
// `nuxt preview` reads PORT/HOST, not devServer. `nuxt dev` must not see those
// names or they override devServer (container bind stays 0.0.0.0 there).
if (process.argv.some(arg => arg === 'preview' || arg.endsWith('/preview'))) {
  process.env.PORT ||= String(brosPort)
  process.env.HOST ||= brosHost
}

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
    host: inContainer ? '0.0.0.0' : brosHost,
    port: brosPort,
  },
  runtimeConfig: {
    brosDir: process.env.BROS_DIR || process.env.BROS_HOME || '',
    brosDataDir: process.env.BROS_DATA_DIR || '',
    brosNetwork: 'bros',
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
