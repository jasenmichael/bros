import { SESSION_COOKIE, hasPasscode, isSessionValid, ensureAppSecret, ensurePasskey } from '../utils/auth'
import { ensureDefaultProviders } from '../utils/providers'
import { getDb } from '../utils/db'
import { autostartSidecars } from '../utils/docker'
import { loadBootstrapConfig } from '../utils/config'
import { migrateSidecarDataLayout } from '../utils/sidecarData'
import { shippedSidecarsRoot } from '../utils/sidecars'
import { needsAuthGate, publicProxyIds } from '../utils/sidecarProxy'

let bootstrapped = false
let autostartDone = false

function bootstrapOnce() {
  if (bootstrapped) return
  getDb()
  ensureAppSecret()
  ensurePasskey()
  ensureDefaultProviders()
  const cfg = loadBootstrapConfig()
  try {
    migrateSidecarDataLayout(cfg.dataDir, shippedSidecarsRoot())
  } catch (err) {
    console.error('sidecar data migrate failed', err instanceof Error ? err.message : err)
  }
  bootstrapped = true
}

export default defineEventHandler(async (event) => {
  bootstrapOnce()
  if (!autostartDone) {
    autostartDone = true
    autostartSidecars().catch((err) => console.error('autostart error', err))
  }

  const path = getRequestURL(event).pathname

  if (
    path.startsWith('/_nuxt')
    || path.startsWith('/__nuxt')
    || path === '/favicon.ico'
    || path.startsWith('/api/auth/')
    || path === '/api/health'
  ) {
    return
  }

  if (path === '/login' || path === '/setup') return

  const needsGate = needsAuthGate(path, publicProxyIds())

  // In-app docs readable after unlock; allow without auth for local docs browsing
  if (path.startsWith('/docs')) return

  if (!needsGate) return

  if (!hasPasscode()) {
    if (path.startsWith('/api/')) {
      if (path === '/api/auth/status') return
      throw createError({ statusCode: 401, statusMessage: 'Setup required' })
    }
    if (path !== '/setup') return sendRedirect(event, '/setup')
    return
  }

  const token = getCookie(event, SESSION_COOKIE)
  if (!isSessionValid(token)) {
    if (path.startsWith('/api/')) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    return sendRedirect(event, '/login')
  }
})
