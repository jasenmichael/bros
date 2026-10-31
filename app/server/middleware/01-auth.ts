import { SESSION_COOKIE, hasPasscode, isSessionValid, ensureAppSecret, ensurePasskey, ensureProxyKey, verifyProxyAuthorization } from '../utils/auth'
import { ensureDefaultProviders } from '../utils/providers'
import { getDb } from '../utils/db'
import { autostartDockerApps, servicesBootPending, shouldRunAutostart } from '../utils/docker'
import { matchPublicProxyTarget, needsAuthGate, publicProxyIds } from '../utils/docker-app/dockerAppProxy'

let bootstrapped = false
let autostartDone = false

function bootstrapOnce() {
  if (bootstrapped) return
  getDb()
  ensureAppSecret()
  ensurePasskey()
  ensureProxyKey()
  ensureDefaultProviders()
  bootstrapped = true
}

export default defineEventHandler(async (event) => {
  bootstrapOnce()
  // Image build prerenders routes in-process. DockerApp autostart is for the serving process only.
  if (shouldRunAutostart() && !autostartDone) {
    autostartDone = true
    autostartDockerApps().catch((err) => console.error('autostart error', err))
  }
  event.context.brosBooting = servicesBootPending()

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

  // Host CLI: Authorization Bearer <proxy-key> for Bros /api/* (compose, check, rebuild).
  if (path.startsWith('/api/') && verifyProxyAuthorization(getRequestHeader(event, 'authorization'))) return

  if (path === '/login' || path === '/setup') return

  const needsGate = needsAuthGate(path, publicProxyIds())
  const apiProxy = matchPublicProxyTarget(path)?.stripPrefix === true

  // In-app docs readable after unlock; allow without auth for local docs browsing
  if (path.startsWith('/docs')) return

  if (apiProxy) {
    if (!hasPasscode()) {
      throw createError({ statusCode: 401, statusMessage: 'Setup required' })
    }
    if (isSessionValid(getCookie(event, SESSION_COOKIE))) return
    if (verifyProxyAuthorization(getRequestHeader(event, 'authorization'))) return
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

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
