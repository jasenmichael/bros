import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { getRequestHeader, getRequestURL, proxyRequest, type H3Event } from 'h3'
import { proxyUpgrade } from 'httpxy'
import { SESSION_COOKIE, isSessionValid } from '../auth'
import { ensureAppsRunning } from '../docker'

export const CLI_TERMINAL_PREFIX = '/terminal/session'
export const CLI_TERMINAL_ORIGIN = 'http://127.0.0.1:7681'

/** Host UI uses the published localhost port. Container `bros-ui` uses `http://bros:7681`. */
export function cliTerminalOrigin(): string {
  return process.env.BROS_TERMINAL_ORIGIN?.trim() || CLI_TERMINAL_ORIGIN
}

export function isCliTerminalPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] || ''
  return path === CLI_TERMINAL_PREFIX || path.startsWith(`${CLI_TERMINAL_PREFIX}/`)
}

function sessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='))
  }
}

export function cliTerminalAuthorized(cookieHeader: string | undefined): boolean {
  return isSessionValid(sessionToken(cookieHeader))
}

export function proxyCliTerminalHttp(event: H3Event) {
  const url = getRequestURL(event)
  const headers: Record<string, string> = {}
  const cookie = getRequestHeader(event, 'cookie')
  if (cookie) headers.cookie = cookie
  return proxyRequest(event, `${cliTerminalOrigin()}${url.pathname}${url.search}`, { headers })
}

export async function upgradeCliTerminal(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined
  if (!cliTerminalAuthorized(cookie)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  try {
    await ensureAppsRunning()
    await proxyUpgrade(cliTerminalOrigin(), req, socket, head, { xfwd: true, changeOrigin: true })
  } catch (err) {
    console.error('[bros] cli terminal', err)
    try {
      socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
    } catch {
      // already closed
    }
    socket.destroy()
  }
}
