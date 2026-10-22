import { getRequestHeader, getRequestHost, type H3Event } from 'h3'
import { loadBootstrapConfig } from './config'

export const CLOUDFLARED_SIDECAR_ID = 'cloudflared'

export const TUNNEL_STOP_LOCKED_MESSAGE =
  'Cannot stop the Cloudflare tunnel while you are connected through it.'

function headerMap(headers: Record<string, string | undefined | null | string[]>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue
    const text = Array.isArray(value) ? value[0] : value
    if (text) out[key.toLowerCase()] = text
  }
  return out
}

export function hostnameOnly(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().split(':')[0] || ''
}

/** Hostname from `public_url` (full URL or bare host). Empty / invalid → ''. */
export function hostnameFromPublicUrl(value: string | null | undefined): string {
  const raw = (value || '').trim()
  if (!raw) return ''
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`)
    return hostnameOnly(url.hostname)
  }
  catch {
    return hostnameOnly(raw.split('/')[0])
  }
}

export function advertisedTunnelHost(input: {
  tunnelHost?: string | null
  publicUrl?: string | null
  lastHostname?: string | null
}): string | null {
  const fromEnv = hostnameOnly(input.tunnelHost ?? process.env.BROS_TUNNEL_HOST)
  if (fromEnv) return fromEnv
  const fromPublic = hostnameFromPublicUrl(input.publicUrl)
  if (fromPublic) return fromPublic
  const last = hostnameOnly(input.lastHostname)
  return last || null
}

/** True when this HTTP request arrived through Cloudflare (tunnel or CF proxy). */
export function isViaTunnel(input: {
  headers?: Record<string, string | undefined | null | string[]>
  host?: string | null
  tunnelHost?: string | null
}): boolean {
  const headers = headerMap(input.headers || {})
  if (headers['cf-ray'] || headers['cf-connecting-ip'] || headers['cf-visitor']) return true
  if ((headers['cdn-loop'] || '').toLowerCase().includes('cloudflare')) return true
  const configured = hostnameOnly(input.tunnelHost ?? process.env.BROS_TUNNEL_HOST)
  const host = hostnameOnly(input.host)
  return Boolean(configured && host && host === configured)
}

export function viaTunnelFromEvent(event: H3Event, extras?: {
  publicUrl?: string | null
  lastHostname?: string | null
}): boolean {
  const publicUrl = extras?.publicUrl ?? loadBootstrapConfig().publicUrl
  return isViaTunnel({
    headers: {
      'cf-ray': getRequestHeader(event, 'cf-ray'),
      'cf-connecting-ip': getRequestHeader(event, 'cf-connecting-ip'),
      'cf-visitor': getRequestHeader(event, 'cf-visitor'),
      'cdn-loop': getRequestHeader(event, 'cdn-loop'),
    },
    host: getRequestHost(event),
    tunnelHost: advertisedTunnelHost({
      publicUrl,
      lastHostname: extras?.lastHostname,
    }),
  })
}

export function tunnelHostname(input: {
  viaTunnel: boolean
  host?: string | null
  tunnelHost?: string | null
}): string | null {
  const configured = (input.tunnelHost ?? process.env.BROS_TUNNEL_HOST ?? '').trim()
  if (configured) return configured
  if (input.viaTunnel && input.host) return input.host.trim()
  return null
}

export function cloudflaredStopBlocked(id: string, viaTunnel: boolean): boolean {
  return viaTunnel && id === CLOUDFLARED_SIDECAR_ID
}

/** Turn the Cloudflare tunnel on/off. On starts the host cloudflared process if it is down. */
export async function applyTunnelPower(
  on: boolean,
  ctx: {
    viaTunnel: boolean
    running: boolean
    start: () => Promise<unknown>
    stop: () => Promise<unknown>
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (on) {
    if (!ctx.running) await ctx.start()
    return { ok: true }
  }
  if (ctx.viaTunnel) return { ok: false, error: TUNNEL_STOP_LOCKED_MESSAGE }
  await ctx.stop()
  return { ok: true }
}
