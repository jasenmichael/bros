export type DockerAppHostIface = {
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

export type DockerAppHostRow = {
  id?: string
  name: string
  packageSlug?: string
  interfaces: DockerAppHostIface[]
}

export type DockerAppOpenLink = {
  label: string
  to: string
  external: true
  hostPort: number
}

export type DockerAppCopyUrl = {
  url: string
  network: 'host' | 'bros'
}

export type DockerAppHostLinkOpts = {
  viaTunnel?: boolean
}

function hostPort(iface: DockerAppHostIface): number | undefined {
  return iface.publish || iface.hostPort
}

function withBasePath(origin: string, basePath?: string): string {
  if (!basePath) return origin
  const path = basePath.startsWith('/') ? basePath : `/${basePath}`
  return `${origin.replace(/\/$/, '')}${path}`
}

function dockerAppId(s: DockerAppHostRow): string {
  return s.id || s.packageSlug || ''
}

function publicProxyPath(id: string): string {
  return `/${id}/`
}

function webUiHref(s: DockerAppHostRow, iface: DockerAppHostIface, port: number, viaTunnel?: boolean): string {
  const id = dockerAppId(s)
  if (iface.proxy?.public && id) {
    if (viaTunnel) return withBasePath(publicProxyPath(id), iface.basePath)
    return withBasePath(`http://127.0.0.1:${port}${publicProxyPath(id)}`, iface.basePath)
  }
  return withBasePath(`http://127.0.0.1:${port}/`, iface.basePath)
}

function dockerAppLinksOfType(s: DockerAppHostRow, types: Set<string>, opts?: DockerAppHostLinkOpts): DockerAppOpenLink[] {
  const out: DockerAppOpenLink[] = []
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
export function dockerAppWebUiLinks(s: DockerAppHostRow, opts?: DockerAppHostLinkOpts): DockerAppOpenLink[] {
  return dockerAppLinksOfType(s, new Set(['webui']), opts)
}

export function dockerAppOpenLinks(s: DockerAppHostRow, opts?: DockerAppHostLinkOpts): DockerAppOpenLink[] {
  return dockerAppWebUiLinks(s, opts)
}

/** Package app webui Open: host publish only while enabled + forwardHost. With services, only while running. */
export function packageWebuiOpenHref(pkg: {
  enabled?: boolean
  forwardHost?: boolean
  services?: unknown[]
  serviceRunning?: boolean
  interfaces?: Array<{ type: string; publish?: number }>
}): string {
  if (pkg.enabled === false || pkg.forwardHost === false) return ''
  if ((pkg.services || []).length && !pkg.serviceRunning) return ''
  const face = (pkg.interfaces || []).find((row) => row.type === 'webui' && row.publish)
  return face?.publish ? `http://127.0.0.1:${face.publish}/` : ''
}

export type DockerAppCardType = 'webui' | 'api' | 'openapi' | 'cli' | 'gui'

const CARD_TYPE: Record<string, DockerAppCardType> = {
  webui: 'webui',
  api: 'api',
  openai: 'openapi',
  cli: 'cli',
  gui: 'gui',
}

/** One pill per type, in first-seen order. */
export function dockerAppTypePills(s: DockerAppHostRow): DockerAppCardType[] {
  const out: DockerAppCardType[] = []
  const seen = new Set<DockerAppCardType>()
  for (const iface of s.interfaces || []) {
    const label = CARD_TYPE[iface.type]
    if (!label || seen.has(label)) continue
    seen.add(label)
    out.push(label)
  }
  return out
}

function pushCopyUrl(out: DockerAppCopyUrl[], seen: Set<string>, url: string, network: 'host' | 'bros') {
  if (seen.has(url)) return
  seen.add(url)
  out.push({ url, network })
}

function siblingWebuiPort(s: DockerAppHostRow, iface: DockerAppHostIface): number | undefined {
  const sibling = (s.interfaces || []).find((row) => row.type === 'webui' && row.service === iface.service && hostPort(row))
  return sibling ? hostPort(sibling) : undefined
}

/** Copyable api or openai URLs. Path only. openai defaults basePath to /v1. */
export function dockerAppEndpointCopyUrls(s: DockerAppHostRow, type: 'api' | 'openai'): DockerAppCopyUrl[] {
  const out: DockerAppCopyUrl[] = []
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
export function dockerAppApiCopyUrls(s: DockerAppHostRow): DockerAppCopyUrl[] {
  return dockerAppEndpointCopyUrls(s, 'api')
}

export function dockerAppCliCommands(s: DockerAppHostRow): string[] {
  const out: string[] = []
  for (const iface of s.interfaces || []) {
    if (iface.type !== 'cli') continue
    const name = (iface.bin || iface.command || '').trim()
    if (name) out.push(name)
  }
  return out
}

/** One row per gui interface. CLI bins are not repeated here. */
export function dockerAppGuiCommands(s: DockerAppHostRow): string[] {
  const out: string[] = []
  for (const iface of s.interfaces || []) {
    if (iface.type !== 'gui') continue
    const name = (iface.command || iface.bin || '').trim()
    if (name) out.push(name)
  }
  return out
}

export type DockerAppCardBlock = {
  label: DockerAppCardType
  rows: Array<{ url?: string; network?: 'host' | 'bros'; command?: string }>
}

/** Card sections. gui rows come only from gui interfaces. */
export function dockerAppCardBlocks(s: DockerAppHostRow, opts?: DockerAppHostLinkOpts): DockerAppCardBlock[] {
  const blocks: DockerAppCardBlock[] = []
  for (const label of dockerAppTypePills(s)) {
    if (label === 'webui') {
      const rows = dockerAppWebUiLinks(s, opts).map((link) => ({ url: link.to }))
      if (rows.length) blocks.push({ label, rows })
    } else if (label === 'api' || label === 'openapi') {
      const rows = dockerAppEndpointCopyUrls(s, label === 'api' ? 'api' : 'openai')
      if (rows.length) blocks.push({ label, rows })
    } else if (label === 'cli') {
      const rows = dockerAppCliCommands(s).map((command) => ({ command }))
      if (rows.length) blocks.push({ label, rows })
    } else if (label === 'gui') {
      const rows = dockerAppGuiCommands(s).map((command) => ({ command }))
      if (rows.length) blocks.push({ label, rows })
    }
  }
  return blocks
}
