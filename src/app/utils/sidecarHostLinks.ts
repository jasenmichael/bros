export type SidecarHostIface = {
  type: string
  service?: string
  containerPort?: number
  publish?: number
  hostPort?: number
  basePath?: string
}

export type SidecarHostRow = {
  name: string
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

function hostPort(iface: SidecarHostIface): number | undefined {
  return iface.publish || iface.hostPort
}

function withBasePath(origin: string, basePath?: string): string {
  if (!basePath) return origin
  const path = basePath.startsWith('/') ? basePath : `/${basePath}`
  return `${origin.replace(/\/$/, '')}${path}`
}

/** Open/Pin targets: published webui or api (Firecrawl has no product Web UI). */
export function sidecarOpenLinks(s: SidecarHostRow): SidecarOpenLink[] {
  const out: SidecarOpenLink[] = []
  const seen = new Set<number>()
  for (const iface of s.interfaces || []) {
    if (iface.type !== 'webui' && iface.type !== 'api') continue
    const port = hostPort(iface)
    if (!port || seen.has(port)) continue
    seen.add(port)
    out.push({
      label: s.name,
      to: `http://127.0.0.1:${port}/`,
      external: true,
      hostPort: port,
    })
  }
  return out
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
