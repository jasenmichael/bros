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
export const DESKTOP_STREAM_ORIGIN = 'http://127.0.0.1:3000'

/** Host UI uses the published localhost port. Container `bros-ui` uses `http://bros:3000`. */
export function desktopStreamOrigin(): string {
  return process.env.BROS_DESKTOP_STREAM_ORIGIN?.trim() || DESKTOP_STREAM_ORIGIN
}

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

/** Selkies paints a real cursor with `!important`. `auto` on the video is the browser text caret. */
export const DESKTOP_INPUT_MARK = 'data-bros-desktop-input'

const DESKTOP_INPUT_SCRIPT = `<script ${DESKTOP_INPUT_MARK}>(function(){var style=document.createElement('style');style.textContent='html,body,video,canvas,#app{cursor:default}';document.documentElement.appendChild(style);function keep(el){if(!el||!el.style)return;var c=el.style.getPropertyValue('cursor');if(el.style.getPropertyPriority('cursor')==='important')return;if(c&&c!=='auto'&&c!=='text'&&c!=='default')return;if(c!=='default')el.style.setProperty('cursor','default')}function sweep(){keep(document.documentElement);keep(document.body);document.querySelectorAll('video,canvas,#app').forEach(keep)}sweep();new MutationObserver(sweep).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['style']});function push(text){if(!text)return;window.postMessage({type:'clipboardUpdateFromUI',text:text},window.location.origin)}document.addEventListener('paste',function(ev){var data=ev.clipboardData;if(data)push(data.getData('text/plain'))},true);document.addEventListener('keydown',function(ev){if(ev.repeat||ev.altKey||ev.shiftKey)return;if(!(ev.ctrlKey||ev.metaKey)||(ev.key!=='v'&&ev.key!=='V'))return;var clip=navigator.clipboard;if(!clip||!clip.readText)return;clip.readText().then(push).catch(function(){})},true)})()</script>`

function insertAtHead(html: string, snippet: string): string {
  const head = /<head[^>]*>/i.exec(html)
  if (!head || head.index === undefined) return snippet + html
  const at = head.index + head[0].length
  return html.slice(0, at) + snippet + html.slice(at)
}

export function injectDesktopStreamVisibility(html: string): string {
  let next = html
  if (!next.includes(DESKTOP_INPUT_MARK)) next = insertAtHead(next, DESKTOP_INPUT_SCRIPT)
  if (!next.includes(DESKTOP_STREAM_VISIBILITY_MARK)) next = insertAtHead(next, DESKTOP_STREAM_VISIBILITY_SCRIPT)
  return next
}

export async function proxyDesktopHttp(event: H3Event) {
  await ensureAppsRunning()
  const url = getRequestURL(event)
  const headers: Record<string, string> = {}
  const cookie = getRequestHeader(event, 'cookie')
  if (cookie) headers.cookie = cookie
  const target = `${desktopStreamOrigin()}${url.pathname}${url.search}`
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
    await proxyUpgrade(desktopStreamOrigin(), req, socket, head, { xfwd: true, changeOrigin: true })
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
