import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { createError, getRequestHeader, getRequestHost, getRequestProtocol, getRequestURL, proxyRequest, sendRedirect, type H3Event } from 'h3'
import { proxyUpgrade } from 'httpxy'
import { SESSION_COOKIE, hasPasscode, isSessionValid, requestIsHttps } from './auth'
import { getProjectStatus } from './docker'
import { sidecarReachUrl } from './hostProbe'
import { discoverSidecars, type DiscoverOptions, type SidecarInterface, type SidecarMeta } from './sidecars'
import { viaTunnelFromEvent } from './viaTunnel'

export type PublicProxyTarget = {
  id: string
  service: string
  containerPort: number
  publish: number
  sidecar: SidecarMeta
  iface: SidecarInterface
}

const DISCOVER_CACHE_MS = 5_000
const RUNNING_CACHE_MS = 2_000

let discoverCache: { at: number; targets: PublicProxyTarget[] } | null = null
const runningCache = new Map<string, { at: number; running: boolean }>()

const WS_INSTALLED = Symbol.for('bros.sidecarWsProxy')

export function resetSidecarProxyCacheForTests() {
  discoverCache = null
  runningCache.clear()
}

export function firstPathSegment(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || ''
  return path.split('/').filter(Boolean)[0] || ''
}

/** Exact first-segment match. `/opencode` matches; `/opencode-extra` does not. */
export function pathMatchesSidecarPrefix(pathname: string, id: string): boolean {
  if (!id) return false
  const path = pathname.split(/[?#]/)[0] || ''
  return path === `/${id}` || path.startsWith(`/${id}/`)
}

export function isPublicProxyPath(pathname: string, ids: Iterable<string>): boolean {
  const seg = firstPathSegment(pathname)
  if (!seg) return false
  for (const id of ids) {
    if (id === seg) return true
  }
  return false
}

export function needsAuthGate(pathname: string, publicProxyIds: Iterable<string> = []): boolean {
  if (
    pathname.startsWith('/api/')
    || pathname === '/'
    || pathname.startsWith('/chat')
    || pathname.startsWith('/models')
    || pathname.startsWith('/providers')
    || pathname.startsWith('/sidecars')
    || pathname.startsWith('/settings')
    || pathname.startsWith('/status')
  ) {
    return true
  }
  return isPublicProxyPath(pathname, publicProxyIds)
}

export function sidecarEnvPortKey(id: string): string {
  return `BROS_${id.replace(/-/g, '_').toUpperCase()}_PORT`
}

export function sidecarProxyUpstreamOrigin(
  input: { service: string; containerPort: number; publish: number; envPortKey?: string },
  env: NodeJS.ProcessEnv = process.env,
): string {
  return sidecarReachUrl({
    service: input.service,
    containerPort: input.containerPort,
    publish: input.publish,
    envPortKey: input.envPortKey,
  }, env)
}

export function sidecarProxyTargetUrl(origin: string, pathname: string, search = ''): string {
  const base = origin.replace(/\/$/, '')
  if (!base.startsWith('http://')) {
    throw new Error('sidecar proxy target must be http')
  }
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${base}${path}${search}`
}

export function publicProxyPrefix(id: string): string {
  return `/${id}`
}

export function collectPublicProxyTargets(sidecars: SidecarMeta[]): PublicProxyTarget[] {
  const out: PublicProxyTarget[] = []
  for (const sidecar of sidecars) {
    if (sidecar.error) continue
    for (const iface of sidecar.interfaces) {
      if (iface.type !== 'webui' || iface.proxy?.public !== true) continue
      if (!iface.service || !iface.containerPort || !iface.publish) continue
      out.push({
        id: sidecar.id,
        service: iface.service,
        containerPort: iface.containerPort,
        publish: iface.publish,
        sidecar,
        iface,
      })
      break
    }
  }
  return out
}

export function listPublicProxyTargets(opts?: DiscoverOptions): PublicProxyTarget[] {
  if (!opts && discoverCache && Date.now() - discoverCache.at < DISCOVER_CACHE_MS) {
    return discoverCache.targets
  }
  const targets = collectPublicProxyTargets(discoverSidecars(opts).sidecars)
  if (!opts) discoverCache = { at: Date.now(), targets }
  return targets
}

export function publicProxyIds(opts?: DiscoverOptions): string[] {
  return listPublicProxyTargets(opts).map((row) => row.id)
}

export function matchPublicProxyTarget(
  pathname: string,
  targets: PublicProxyTarget[] = listPublicProxyTargets(),
): PublicProxyTarget | null {
  const seg = firstPathSegment(pathname)
  if (!seg) return null
  return targets.find((row) => row.id === seg) || null
}

export function stripNamedCookie(cookie: string | undefined, name: string): string | undefined {
  if (!cookie) return undefined
  const kept = cookie.split(';').map((part) => part.trim()).filter((part) => {
    const key = part.split('=')[0]?.trim()
    return Boolean(key) && key !== name
  })
  return kept.length ? kept.join('; ') : undefined
}

export function stripSessionCookie(cookie: string | undefined): string | undefined {
  return stripNamedCookie(cookie, SESSION_COOKIE)
}

function hostOfOrigin(origin: string): string {
  try {
    return new URL(origin).host
  }
  catch {
    return ''
  }
}

function joinPrefixPath(prefix: string, pathAndQuery: string): string {
  if (!pathAndQuery || pathAndQuery === '/') return `${prefix}/`
  if (
    pathAndQuery === prefix
    || pathAndQuery.startsWith(`${prefix}/`)
    || pathAndQuery.startsWith(`${prefix}?`)
    || pathAndQuery.startsWith(`${prefix}#`)
  ) {
    return pathAndQuery
  }
  return pathAndQuery.startsWith('/') ? `${prefix}${pathAndQuery}` : `${prefix}/${pathAndQuery}`
}

export function rewriteProxyLocation(input: {
  location: string
  prefix: string
  upstreamOrigins: string[]
}): string {
  const prefix = input.prefix.startsWith('/') ? input.prefix : `/${input.prefix}`
  const loc = input.location.trim()
  if (!loc) return loc

  const upstreamHosts = new Set(input.upstreamOrigins.map(hostOfOrigin).filter(Boolean))

  if (loc.startsWith('//')) {
    try {
      const url = new URL(`http:${loc}`)
      if (upstreamHosts.has(url.host)) {
        return joinPrefixPath(prefix, `${url.pathname}${url.search}${url.hash}`)
      }
    }
    catch {
      return loc
    }
    return loc
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(loc)) {
    try {
      const url = new URL(loc)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return loc
      if (upstreamHosts.has(url.host)) {
        return joinPrefixPath(prefix, `${url.pathname}${url.search}${url.hash}`)
      }
    }
    catch {
      return loc
    }
    return loc
  }

  if (loc.startsWith('/')) return joinPrefixPath(prefix, loc)
  return loc
}

export function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    if (trimmed.slice(0, eq).trim() === name) return trimmed.slice(eq + 1)
  }
  return undefined
}

export async function publicProxyIsRunning(target: PublicProxyTarget): Promise<boolean> {
  const hit = runningCache.get(target.id)
  if (hit && Date.now() - hit.at < RUNNING_CACHE_MS) return hit.running
  try {
    const status = await getProjectStatus(target.sidecar)
    runningCache.set(target.id, { at: Date.now(), running: status.running })
    return status.running
  }
  catch {
    runningCache.delete(target.id)
    return true
  }
}

function forwardedProto(event: H3Event): string {
  return requestIsHttps({
    protocol: getRequestProtocol(event),
    forwardedProto: getRequestHeader(event, 'x-forwarded-proto'),
    cfVisitor: getRequestHeader(event, 'cf-visitor'),
    viaTunnel: viaTunnelFromEvent(event),
  }) ? 'https' : 'http'
}

function upstreamOriginsFor(target: PublicProxyTarget, env: NodeJS.ProcessEnv = process.env): string[] {
  const key = sidecarEnvPortKey(target.id)
  return [
    `http://${target.service}:${target.containerPort}`,
    sidecarProxyUpstreamOrigin({
      service: target.service,
      containerPort: target.containerPort,
      publish: target.publish,
      envPortKey: key,
    }, env),
    `http://127.0.0.1:${target.publish}`,
  ].filter((value, index, all) => all.indexOf(value) === index)
}

export async function proxySidecarHttp(event: H3Event, target: PublicProxyTarget): Promise<unknown> {
  const url = getRequestURL(event)
  const prefix = publicProxyPrefix(target.id)
  if (url.pathname === prefix) {
    return sendRedirect(event, `${prefix}/${url.search}`, 308)
  }

  const origin = sidecarProxyUpstreamOrigin({
    service: target.service,
    containerPort: target.containerPort,
    publish: target.publish,
    envPortKey: sidecarEnvPortKey(target.id),
  })
  const upstream = sidecarProxyTargetUrl(origin, url.pathname, url.search)
  const cookie = stripSessionCookie(getRequestHeader(event, 'cookie'))
  const headers: Record<string, string> = {
    host: hostOfOrigin(origin) || new URL(origin).host,
    'x-forwarded-host': getRequestHost(event),
    'x-forwarded-proto': forwardedProto(event),
    'x-forwarded-prefix': prefix,
  }
  if (cookie) headers.cookie = cookie
  else headers.cookie = ''

  try {
    return await proxyRequest(event, upstream, {
      streamRequest: true,
      fetchOptions: { redirect: 'manual' },
      headers,
      onResponse(proxyEvent) {
        const location = proxyEvent.node.res.getHeader('location')
        if (typeof location !== 'string' || !location) return
        proxyEvent.node.res.setHeader(
          'location',
          rewriteProxyLocation({
            location,
            prefix,
            upstreamOrigins: upstreamOriginsFor(target),
          }),
        )
      },
    })
  }
  catch (err) {
    const status = typeof err === 'object' && err && 'statusCode' in err
      ? Number((err as { statusCode?: number }).statusCode)
      : 0
    if (status === 502 || status === 504) throw err
    throw createError({ statusCode: 502, statusMessage: 'Bad Gateway', cause: err })
  }
}

export async function handleSidecarRequest(event: H3Event): Promise<unknown> {
  const pathname = getRequestURL(event).pathname
  const target = matchPublicProxyTarget(pathname)
  if (!target) return
  if (!await publicProxyIsRunning(target)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  const upgrade = (getRequestHeader(event, 'upgrade') || '').toLowerCase()
  if (upgrade === 'websocket') {
    const req = event.node.req
    const socket = req.socket
    if (socket) {
      await upgradePublicProxy(req, socket, Buffer.alloc(0), target)
      return
    }
  }
  return proxySidecarHttp(event, target)
}

function unauthorizedSocket(socket: Duplex) {
  socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
  socket.destroy()
}

function gatewaySocket(socket: Duplex) {
  try {
    socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
  }
  catch {
    // already closed
  }
  socket.destroy()
}

export async function upgradePublicProxy(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  target: PublicProxyTarget,
): Promise<void> {
  if (!hasPasscode() || !isSessionValid(cookieValue(req.headers.cookie, SESSION_COOKIE))) {
    unauthorizedSocket(socket)
    return
  }
  if (!await publicProxyIsRunning(target)) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  const origin = sidecarProxyUpstreamOrigin({
    service: target.service,
    containerPort: target.containerPort,
    publish: target.publish,
    envPortKey: sidecarEnvPortKey(target.id),
  })
  const cookie = stripSessionCookie(typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined)
  if (cookie) req.headers.cookie = cookie
  else delete req.headers.cookie
  try {
    await proxyUpgrade(origin, req, socket, head, {
      xfwd: true,
      changeOrigin: true,
      headers: {
        'x-forwarded-prefix': publicProxyPrefix(target.id),
      },
    })
  }
  catch (err) {
    console.error('[bros] sidecar ws proxy', err)
    gatewaySocket(socket)
  }
}

export function installSidecarWsProxy(server: Server) {
  const marked = server as Server & { [WS_INSTALLED]?: boolean }
  if (marked[WS_INSTALLED]) return
  marked[WS_INSTALLED] = true

  const existing = server.listeners('upgrade').slice()
  server.removeAllListeners('upgrade')
  server.on('upgrade', (req, socket, head) => {
    const path = (req.url || '/').split(/[?#]/)[0] || '/'
    const target = matchPublicProxyTarget(path)
    if (target) {
      void upgradePublicProxy(req, socket, head, target).catch((err) => {
        console.error('[bros] sidecar ws proxy', err)
        gatewaySocket(socket)
      })
      return
    }
    for (const listener of existing) {
      listener.call(server, req, socket, head)
    }
  })
}
