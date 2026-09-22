export type SidecarHostIface = {
  type: string
  service?: string
  containerPort?: number
  publish?: number
  hostPort?: number
  basePath?: string
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
    if (viaTunnel) return publicProxyPath(id)
    return `http://127.0.0.1:${port}${publicProxyPath(id)}`
  }
  return `http://127.0.0.1:${port}/`
}

function sidecarLinksOfType(s: SidecarHostRow, types: Set<string>, opts?: SidecarHostLinkOpts): SidecarOpenLink[] {
  const out: SidecarOpenLink[] = []
  const seen = new Set<number>()
  for (const iface of s.interfaces || []) {
    if (!types.has(iface.type)) continue
    const port = hostPort(iface)
    if (!port || seen.has(port)) continue
    seen.add(port)
    out.push({
      label: s.name,
      to: webUiHref(s, iface, port, opts?.viaTunnel),
      external: true,
      hostPort: port,
    })
  }
  return out
}

/** Open targets: published webui or api (Firecrawl API has no product Web UI). */
export function sidecarOpenLinks(s: SidecarHostRow, opts?: SidecarHostLinkOpts): SidecarOpenLink[] {
  return sidecarLinksOfType(s, new Set(['webui', 'api']), opts)
}

/** Pin in nav: published webui only. */
export function sidecarWebUiLinks(s: SidecarHostRow, opts?: SidecarHostLinkOpts): SidecarOpenLink[] {
  return sidecarLinksOfType(s, new Set(['webui']), opts)
}

/** Copyable API URLs: host publish, then Docker DNS on network bros. */
export function sidecarApiCopyUrls(s: SidecarHostRow): SidecarCopyUrl[] {
  const out: SidecarCopyUrl[] = []
  const seen = new Set<string>()
  for (const iface of s.interfaces || []) {
    if (iface.type !== 'api') continue
    const port = hostPort(iface)
    if (port) {
      const origin = `http://127.0.0.1:${port}/`
      for (const url of [origin, withBasePath(origin, iface.basePath)]) {
        if (seen.has(url)) continue
        seen.add(url)
        out.push({ url, network: 'host' })
      }
    }
    const service = iface.service?.trim()
    const containerPort = iface.containerPort || port
    if (service && containerPort) {
      const origin = `http://${service}:${containerPort}/`
      for (const url of [origin, withBasePath(origin, iface.basePath)]) {
        if (seen.has(url)) continue
        seen.add(url)
        out.push({ url, network: 'bros' })
      }
    }
  }
  return out
}
