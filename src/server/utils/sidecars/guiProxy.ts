import { existsSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { join } from 'pathe'
import { getRequestHeader, getRequestURL, proxyRequest, type H3Event } from 'h3'
import { proxyUpgrade } from 'httpxy'
import { SESSION_COOKIE, isSessionValid } from '../auth'
import { loadBootstrapConfig } from '../config'
import { ensureAppsRunning } from '../docker'

export const DESKTOP_STREAM_PREFIX = '/desktop/view'
export const DESKTOP_STREAM_ORIGIN = 'http://desktop:3000'

const GUI_ID_RE = /^[a-z0-9][a-z0-9_-]*$/

export function guiProcessOpen(id: string): boolean {
  if (!GUI_ID_RE.test(id)) return false
  return existsSync(join(loadBootstrapConfig().dataDir, 'desktop', 'live', 'gui', id, 'pid'))
}

export function isDesktopStreamPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] || ''
  return path === DESKTOP_STREAM_PREFIX || path.startsWith(`${DESKTOP_STREAM_PREFIX}/`)
}

function sessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='))
  }
}

export function desktopStreamAuthorized(cookieHeader: string | undefined): boolean {
  return isSessionValid(sessionToken(cookieHeader))
}

export async function proxyDesktopHttp(event: H3Event) {
  await ensureAppsRunning()
  const url = getRequestURL(event)
  const headers: Record<string, string> = {}
  const cookie = getRequestHeader(event, 'cookie')
  if (cookie) headers.cookie = cookie
  return proxyRequest(event, `${DESKTOP_STREAM_ORIGIN}${url.pathname}${url.search}`, { headers })
}

export async function upgradeDesktop(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined
  if (!desktopStreamAuthorized(cookie)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  try {
    await ensureAppsRunning()
    await proxyUpgrade(DESKTOP_STREAM_ORIGIN, req, socket, head, { xfwd: true, changeOrigin: true })
  } catch (err) {
    console.error('[bros] desktop stream', err)
    try {
      socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
    } catch {
      // already closed
    }
    socket.destroy()
  }
}
