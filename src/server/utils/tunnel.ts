import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'pathe'
import { loadBootstrapConfig } from './config'

export const TUNNEL_HELPER_STALE_MS = 15_000

export type TunnelStatus = {
  running: boolean
  pid: number | null
  hostname: string | null
  publicUrl: string | null
  error: string | null
  installed: boolean
  loggedIn: boolean
  helper: boolean
  updatedAt: number | null
  helperAlive: boolean
}

const emptyStatus = (): TunnelStatus => ({
  running: false,
  pid: null,
  hostname: null,
  publicUrl: null,
  error: null,
  installed: false,
  loggedIn: false,
  helper: false,
  updatedAt: null,
  helperAlive: false,
})

export function tunnelDir(dataDir: string): string {
  return join(dataDir, 'tunnel')
}

export function ensureTunnelDir(dataDir: string): string {
  const dir = tunnelDir(dataDir)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function isCloudflaredInstalled(binaryPath: string | null | undefined): boolean {
  return Boolean(binaryPath && binaryPath.trim())
}

export function isCloudflaredLoggedIn(input: { certExists: boolean; tunnelListOk?: boolean }): boolean {
  return Boolean(input.certExists || input.tunnelListOk)
}

/** True when `cloudflared tunnel route dns` did not bind the requested hostname. */
export function namedTunnelRouteOwned(requestedHost: string, routeOutput: string): boolean {
  const want = requestedHost.trim().replace(/\.$/, '').toLowerCase()
  const added = routeOutput.match(/Added CNAME\s+([^\s]+)/i)
  if (added) {
    const got = added[1].replace(/\.$/, '').toLowerCase()
    return Boolean(want && got === want)
  }
  if (/could not find zone|zone not found|no zone matching|does not exist|not have access|unauthorized/i.test(routeOutput)) {
    return false
  }
  return true
}

export function isCloudflareZoneOwnershipError(routeOutput: string, requestedHost: string): boolean {
  return !namedTunnelRouteOwned(requestedHost, routeOutput)
}

export function parseQuickTunnelHostname(logText: string): string | null {
  const matches = logText.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/gi)
  if (!matches?.length) return null
  const url = matches[matches.length - 1]
  return url.replace(/^https:\/\//i, '').toLowerCase()
}

export function isTunnelHelperAlive(
  updatedAt: number | null | undefined,
  now = Date.now(),
  staleMs = TUNNEL_HELPER_STALE_MS,
): boolean {
  if (!updatedAt) return false
  return now - updatedAt <= staleMs
}

export function tailLines(text: string, n: number): string {
  const cap = Math.min(Math.max(n, 1), 2000)
  const lines = text.replace(/\n$/, '').split(/\r?\n/)
  return lines.slice(-cap).join('\n')
}

export function readTunnelStatus(dataDir: string, now = Date.now()): TunnelStatus {
  const file = join(tunnelDir(dataDir), 'status.json')
  if (!existsSync(file)) return emptyStatus()
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<TunnelStatus>
    const hostname = typeof raw.hostname === 'string' && raw.hostname.trim()
      ? raw.hostname.trim()
      : null
    const publicUrl = typeof raw.publicUrl === 'string' && raw.publicUrl.trim()
      ? raw.publicUrl.trim()
      : null
    const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : null
    return {
      running: Boolean(raw.running),
      pid: typeof raw.pid === 'number' ? raw.pid : null,
      hostname,
      publicUrl,
      error: typeof raw.error === 'string' && raw.error.trim() ? raw.error : null,
      installed: Boolean(raw.installed),
      loggedIn: Boolean(raw.loggedIn),
      helper: Boolean(raw.helper),
      updatedAt,
      helperAlive: isTunnelHelperAlive(updatedAt, now),
    }
  } catch {
    return emptyStatus()
  }
}

export function readTunnelLogs(dataDir: string, tail = 80): string {
  const file = join(tunnelDir(dataDir), 'logs.txt')
  if (!existsSync(file)) return ''
  return tailLines(readFileSync(file, 'utf8'), tail)
}

export function writeTunnelCommand(dataDir: string, command: 'start' | 'stop'): void {
  const dir = ensureTunnelDir(dataDir)
  writeFileSync(join(dir, 'enabled'), command === 'start' ? '1\n' : '0\n')
  writeFileSync(join(dir, 'command'), `${command}\n`)
}

export function currentTunnelDataDir(): string {
  return loadBootstrapConfig().dataDir
}

export async function waitForTunnelState(
  dataDir: string,
  wantRunning: boolean,
  timeoutMs = 15_000,
  pollMs = 250,
  since = Date.now(),
): Promise<TunnelStatus> {
  const started = Date.now()
  let last = readTunnelStatus(dataDir)
  while (Date.now() - started < timeoutMs) {
    last = readTunnelStatus(dataDir)
    const freshError = Boolean(
      last.error
      && last.running !== wantRunning
      && last.helperAlive
      && last.updatedAt
      && last.updatedAt >= since,
    )
    if (freshError) return last
    if (last.helperAlive && last.running === wantRunning) return last
    await new Promise((r) => setTimeout(r, pollMs))
  }
  return last
}

export function tunnelPublicPayload(status: TunnelStatus, publicUrl?: string | null) {
  const advertised = (publicUrl ?? status.publicUrl ?? '').trim() || null
  return {
    running: status.running,
    hostname: status.hostname || advertised,
    publicUrl: advertised,
    installed: status.installed,
    loggedIn: status.loggedIn,
    helperAlive: status.helperAlive,
    error: status.error,
  }
}
