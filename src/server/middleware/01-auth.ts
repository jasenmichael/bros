import { SESSION_COOKIE, hasPasscode, isSessionValid, ensureAppSecret, ensurePasskey } from '../utils/auth'
import { ensureDefaultProviders } from '../utils/providers'
import { getDb } from '../utils/db'
import { autostartSidecars } from '../utils/docker'

let bootstrapped = false
let autostartDone = false

function bootstrapOnce() {
  if (bootstrapped) return
  getDb()
  ensureAppSecret()
  ensurePasskey()
  ensureDefaultProviders()
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

  const needsGate =
    path.startsWith('/api/')
    || path === '/'
    || path.startsWith('/chat')
    || path.startsWith('/models')
    || path.startsWith('/sidecars')
    || path.startsWith('/settings')
    || path.startsWith('/status')

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
