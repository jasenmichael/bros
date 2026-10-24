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

/** Selkies pauses on `document.hidden` and stays on "Waiting for stream..." until that frame fires `visibilitychange`. An embedded document can stay hidden while `/desktop` is showing. Track the parent page instead. */
export const DESKTOP_STREAM_VISIBILITY_MARK = 'data-bros-stream-visibility'

const DESKTOP_STREAM_VISIBILITY_SCRIPT = `<script ${DESKTOP_STREAM_VISIBILITY_MARK}>(function(){if(window.parent===window)return;var parentDoc;try{parentDoc=window.parent.document}catch(e){return}function shown(){return parentDoc.visibilityState==="visible"}try{Object.defineProperty(document,"hidden",{configurable:true,get:function(){return !shown()}});Object.defineProperty(document,"visibilityState",{configurable:true,get:function(){return shown()?"visible":"hidden"}})}catch(e){return}parentDoc.addEventListener("visibilitychange",function(){document.dispatchEvent(new Event("visibilitychange"))})})()</script>`

export function injectDesktopStreamVisibility(html: string): string {
  if (html.includes(DESKTOP_STREAM_VISIBILITY_MARK)) return html
  const head = /<head[^>]*>/i.exec(html)
  if (!head || head.index === undefined) return DESKTOP_STREAM_VISIBILITY_SCRIPT + html
  const at = head.index + head[0].length
  return html.slice(0, at) + DESKTOP_STREAM_VISIBILITY_SCRIPT + html.slice(at)
}

export async function proxyDesktopHttp(event: H3Event) {
  await ensureAppsRunning()
  const url = getRequestURL(event)
  const headers: Record<string, string> = {}
  const cookie = getRequestHeader(event, 'cookie')
  if (cookie) headers.cookie = cookie
  const target = `${DESKTOP_STREAM_ORIGIN}${url.pathname}${url.search}`
  return proxyRequest(event, target, {
    headers,
    onResponse: async (_event, response) => {
      const type = String(response.headers.get('content-type') || '')
      if (response.status !== 200 || !type.includes('text/html')) return
      const fetched = response as Response & { _data?: string }
      const html = await fetched.text()
      fetched._data = injectDesktopStreamVisibility(html)
    },
  })
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
