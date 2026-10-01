export type SidecarHostIface = {
  type: string
  service?: string
  containerPort?: number
  publish?: number
  hostPort?: number
  basePath?: string
  command?: string
  bin?: string
  proxy?: { public?: boolean }
}

export type SidecarHostRow = {
  id?: string
  name: string
  packageSlug?: string
  interfaces: SidecarHostIface[]
}

export type SidecarOpenLink = {
  label: string
  to: string
  external: true
  hostPort: number
}

export type SidecarCopyUrl = {
  url: string
  network: 'host' | 'bros'
}

export type SidecarHostLinkOpts = {
  viaTunnel?: boolean
}

function hostPort(iface: SidecarHostIface): number | undefined {
  return iface.publish || iface.hostPort
}

function withBasePath(origin: string, basePath?: string): string {
  if (!basePath) return origin
  const path = basePath.startsWith('/') ? basePath : `/${basePath}`
  return `${origin.replace(/\/$/, '')}${path}`
}

function sidecarId(s: SidecarHostRow): string {
  return s.id || s.packageSlug || ''
}

function publicProxyPath(id: string): string {
  return `/${id}/`
}

function webUiHref(s: SidecarHostRow, iface: SidecarHostIface, port: number, viaTunnel?: boolean): string {
  const id = sidecarId(s)
  if (iface.proxy?.public && id) {
    if (viaTunnel) return withBasePath(publicProxyPath(id), iface.basePath)
    return withBasePath(`http://127.0.0.1:${port}${publicProxyPath(id)}`, iface.basePath)
  }
  return withBasePath(`http://127.0.0.1:${port}/`, iface.basePath)
}

function sidecarLinksOfType(s: SidecarHostRow, types: Set<string>, opts?: SidecarHostLinkOpts): SidecarOpenLink[] {
  const out: SidecarOpenLink[] = []
  const seen = new Set<string>()
  for (const iface of s.interfaces || []) {
    if (!types.has(iface.type)) continue
    const port = hostPort(iface)
    if (!port) continue
    const to = webUiHref(s, iface, port, opts?.viaTunnel)
    if (seen.has(to)) continue
    seen.add(to)
    out.push({
      label: s.name,
      to,
      external: true,
      hostPort: port,
    })
  }
  return out
}

/** Open and Pin: published webui only. */
export function sidecarWebUiLinks(s: SidecarHostRow, opts?: SidecarHostLinkOpts): SidecarOpenLink[] {
  return sidecarLinksOfType(s, new Set(['webui']), opts)
}

export function sidecarOpenLinks(s: SidecarHostRow, opts?: SidecarHostLinkOpts): SidecarOpenLink[] {
  return sidecarWebUiLinks(s, opts)
}

export type SidecarCardType = 'ui' | 'api' | 'openapi' | 'cli'

const CARD_TYPE: Record<string, SidecarCardType> = {
  webui: 'ui',
  api: 'api',
  openai: 'openapi',
  cli: 'cli',
}

/** One pill per type, in first-seen order. */
export function sidecarTypePills(s: SidecarHostRow): SidecarCardType[] {
  const out: SidecarCardType[] = []
  const seen = new Set<SidecarCardType>()
  for (const iface of s.interfaces || []) {
    const label = CARD_TYPE[iface.type]
    if (!label || seen.has(label)) continue
    seen.add(label)
    out.push(label)
  }
  return out
}

function pushCopyUrl(out: SidecarCopyUrl[], seen: Set<string>, url: string, network: 'host' | 'bros') {
  if (seen.has(url)) return
  seen.add(url)
  out.push({ url, network })
}

function siblingWebuiPort(s: SidecarHostRow, iface: SidecarHostIface): number | undefined {
  const sibling = (s.interfaces || []).find((row) => row.type === 'webui' && row.service === iface.service && hostPort(row))
  return sibling ? hostPort(sibling) : undefined
}

/** Copyable api or openai URLs. Path only. openai defaults basePath to /v1. */
export function sidecarEndpointCopyUrls(s: SidecarHostRow, type: 'api' | 'openai'): SidecarCopyUrl[] {
  const out: SidecarCopyUrl[] = []
  const seen = new Set<string>()
  for (const iface of s.interfaces || []) {
    if (iface.type !== type) continue
    const basePath = iface.basePath || (type === 'openai' ? '/v1' : undefined)
    const port = hostPort(iface) || (type === 'openai' ? siblingWebuiPort(s, iface) : undefined)
    if (port) pushCopyUrl(out, seen, withBasePath(`http://127.0.0.1:${port}/`, basePath), 'host')
    const service = iface.service?.trim()
    const containerPort = iface.containerPort || port
    if (service && containerPort) {
      pushCopyUrl(out, seen, withBasePath(`http://${service}:${containerPort}/`, basePath), 'bros')
    }
  }
  return out
}

/** Copyable API URLs: host publish, then Docker DNS on network bros. */
export function sidecarApiCopyUrls(s: SidecarHostRow): SidecarCopyUrl[] {
  return sidecarEndpointCopyUrls(s, 'api')
}

export function sidecarCliCommands(s: SidecarHostRow): string[] {
  const out: string[] = []
  for (const iface of s.interfaces || []) {
    if (iface.type !== 'cli') continue
    const name = (iface.bin || iface.command || '').trim()
    if (name) out.push(name)
  }
  return out
}
