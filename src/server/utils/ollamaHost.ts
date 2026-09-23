import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { getDb, sidecarSettings } from './db'
import { appRunsInDocker, dockerHostCandidates, sidecarReachUrl } from './hostProbe'
import { projectName } from './sidecars'

export type PublishedHostPort = {
  port: number
  project?: string
  containerName?: string
  image?: string
}

export const OLLAMA_SIDECAR_DNS = 'http://ollama:11434'
export const OLLAMA_SIDECAR_PUBLISH = 11435
export const OLLAMA_HOST_DEFAULT_PORT = 11434
export const OLLAMA_BROS_PROJECT = projectName('ollama')

export type OllamaChatSource = 'host' | 'sidecar'

/** Persist only host | sidecar. Legacy `external` rows resolve like unset mode. */
export function normalizeOllamaMode(mode?: string | null): OllamaChatSource | undefined {
  if (mode === 'host' || mode === 'sidecar') return mode
  return undefined
}

export type HostOllamaHit = {
  port: number | null
  version: string | null
  host: string | null
  error: string | null
  manual: boolean
}

const CACHE_MS = 30_000
let cache: { at: number; key: string; value: HostOllamaHit } | null = null
let testManualPort: number | null | undefined
let testListenPorts: number[] | undefined
let testDockerPorts: PublishedHostPort[] | undefined

export function resetOllamaHostCache() {
  cache = null
  testManualPort = undefined
  testListenPorts = undefined
  testDockerPorts = undefined
}

/** @deprecated use resetOllamaHostCache */
export const resetOllamaHostCacheForTests = resetOllamaHostCache

/** Test-only: skip SQLite when set (including `null`). */
export function setOllamaManualPortForTests(port: number | null) {
  testManualPort = port
  cache = null
}

/** Test-only: skip /proc when set (including `[]`). */
export function setHostListenPortsForTests(ports: number[]) {
  testListenPorts = ports
  cache = null
}

/** Test-only: skip dockerode when set (including `[]`). */
export function setDockerPublishedPortsForTests(ports: PublishedHostPort[]) {
  testDockerPorts = ports
  cache = null
}

export function isOllamaLikeContainer(image?: string, containerName?: string) {
  const img = (image || '').toLowerCase()
  const name = (containerName || '').toLowerCase()
  return img.includes('ollama') || name.includes('ollama')
}

export function hostOllamaUrl(port: number, host?: string | null): string {
  return `http://${host || dockerHostCandidates()[0]}:${port}`
}

/** Reachable sidecar Ollama: Docker DNS in-container, publish port on host Node. */
export function sidecarOllamaUrl(): string {
  return sidecarReachUrl({
    service: 'ollama',
    containerPort: 11434,
    publish: OLLAMA_SIDECAR_PUBLISH,
    envPortKey: 'BROS_OLLAMA_PORT',
  })
}

export async function probeOllamaVersion(port: number, timeoutMs = 800): Promise<{ version: string; host: string } | null> {
  for (const host of dockerHostCandidates()) {
    try {
      const res = await fetch(`http://${host}:${port}/api/version`, {
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) continue
      const json = await res.json() as { version?: unknown }
      if (typeof json.version === 'string' && json.version) return { version: json.version, host }
    } catch {
      // try next host
    }
  }
  return null
}

async function ownerProject(port: number): Promise<string | undefined> {
  try {
    const { publishedPortOwner } = await import('./docker')
    return (await publishedPortOwner(port))?.project
  } catch {
    return undefined
  }
}

async function ownerIsBrosSidecar(port: number): Promise<boolean> {
  try {
    const { publishedPortOwner } = await import('./docker')
    const owner = await publishedPortOwner(port)
    if (!owner) return false
    return isBrosSidecarProject(owner.project) || isBrosOllamaSidecar(owner.project, owner.containerName)
  } catch {
    return false
  }
}

export function readOllamaManualPort(): number | null {
  if (testManualPort !== undefined) return testManualPort
  const row = getDb().select().from(sidecarSettings).where(eq(sidecarSettings.sidecarId, 'ollama')).get()
  const n = row?.hostProbePort
  return typeof n === 'number' && n > 0 ? n : null
}

const TCP_LISTEN = '0A'

/** Parse /proc/net/tcp or tcp6. Local port is hex after the last colon. State 0A = LISTEN. */
export function parseProcNetListenPorts(content: string): number[] {
  const ports = new Set<number>()
  for (const line of content.split('\n')) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 4 || cols[0] === 'sl') continue
    const local = cols[1]
    const state = cols[3]
    if (state !== TCP_LISTEN || !local) continue
    const colon = local.lastIndexOf(':')
    if (colon < 0) continue
    const port = Number.parseInt(local.slice(colon + 1), 16)
    if (Number.isInteger(port) && port > 0 && port <= 65535) ports.add(port)
  }
  return [...ports]
}

export function readHostListenPorts(): number[] {
  if (testListenPorts !== undefined) return testListenPorts
  if (appRunsInDocker()) return []
  const ports = new Set<number>()
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    try {
      for (const port of parseProcNetListenPorts(readFileSync(file, 'utf8'))) ports.add(port)
    } catch {
      // missing /proc
    }
  }
  return [...ports]
}

async function listDockerPublishedPorts(): Promise<PublishedHostPort[]> {
  if (testDockerPorts !== undefined) return testDockerPorts
  try {
    const { listPublishedHostPorts } = await import('./docker')
    return await listPublishedHostPorts()
  } catch {
    return []
  }
}

function isBrosSidecarProject(project?: string) {
  return Boolean(project && (project === OLLAMA_BROS_PROJECT || project.startsWith('bros-sc-')))
}

function isBrosOllamaSidecar(project?: string, containerName?: string) {
  if (project === OLLAMA_BROS_PROJECT) return true
  const name = (containerName || '').replace(/^\//, '').toLowerCase()
  return name === 'bros-sc-ollama' || name.startsWith('bros-sc-ollama-')
}

function skipSidecarPort(
  port: number,
  project?: string,
  sidecarPorts?: Set<number>,
  containerName?: string,
) {
  if (port === OLLAMA_SIDECAR_PUBLISH) return true
  if (sidecarPorts?.has(port)) return true
  if (isBrosOllamaSidecar(project, containerName)) return true
  return isBrosSidecarProject(project)
}

async function probeAllowedHostPort(
  port: number,
  sidecarPorts: Set<number>,
  timeoutMs?: number,
): Promise<{ version: string; host: string } | null> {
  if (skipSidecarPort(port, undefined, sidecarPorts)) return null
  if (await ownerIsBrosSidecar(port)) return null
  return probeOllamaVersion(port, timeoutMs)
}

export async function findHostOllama(opts?: { bustCache?: boolean }): Promise<HostOllamaHit> {
  const manual = readOllamaManualPort()
  const key = `m:${manual ?? ''}:d:${appRunsInDocker()}`
  if (!opts?.bustCache && cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.value

  const store = (value: HostOllamaHit) => {
    cache = { at: Date.now(), key, value }
    return value
  }

  if (manual != null) {
    if (await ownerProject(manual) === OLLAMA_BROS_PROJECT) {
      return store({
        port: null,
        version: null,
        host: null,
        error: `Port ${manual} is the Bros Ollama sidecar, not a host install.`,
        manual: true,
      })
    }
    const hit = await probeOllamaVersion(manual)
    if (!hit) {
      return store({
        port: null,
        version: null,
        host: null,
        error: `No Ollama on :${manual}`,
        manual: true,
      })
    }
    return store({ port: manual, version: hit.version, host: hit.host, error: null, manual: true })
  }

  const published = await listDockerPublishedPorts()
  const sidecarPorts = new Set(
    published
      .filter((row) => isBrosSidecarProject(row.project) || isBrosOllamaSidecar(row.project, row.containerName))
      .map((row) => row.port),
  )
  sidecarPorts.add(OLLAMA_SIDECAR_PUBLISH)
  const ollamaDocker: number[] = []
  const otherDocker: number[] = []
  for (const row of published) {
    if (skipSidecarPort(row.port, row.project, sidecarPorts, row.containerName)) continue
    if (isOllamaLikeContainer(row.image, row.containerName)) ollamaDocker.push(row.port)
    else otherDocker.push(row.port)
  }

  // Privileged /proc ports are almost never Ollama; skip to avoid probing ssh/dns on every GET.
  const listen = readHostListenPorts().filter((port) => port >= 1024 && !skipSidecarPort(port, undefined, sidecarPorts))
  const seen = new Set<number>()
  const ordered: number[] = []
  const push = (port: number) => {
    if (seen.has(port) || skipSidecarPort(port, undefined, sidecarPorts)) return
    seen.add(port)
    ordered.push(port)
  }
  // Host default 11434 first (host-gateway in Docker); then Docker Ollama; then leftover listen/published.
  push(OLLAMA_HOST_DEFAULT_PORT)
  for (const port of [...ollamaDocker].sort((a, b) => a - b)) push(port)
  for (const port of [...listen].sort((a, b) => a - b)) push(port)
  for (const port of [...otherDocker].sort((a, b) => a - b)) push(port)

  for (const port of ordered) {
    const hit = await probeAllowedHostPort(port, sidecarPorts, 400)
    if (hit) return store({ port, version: hit.version, host: hit.host, error: null, manual: false })
  }
  return store({ port: null, version: null, host: null, error: null, manual: false })
}

export async function scanHostOllama(): Promise<HostOllamaHit> {
  return findHostOllama({ bustCache: true })
}

export async function scanHostOllamaApi() {
  const { assertHostOllamaVisible } = await import('./hostOllamaSettings')
  assertHostOllamaVisible('ollama-host')
  const hit = await scanHostOllama()
  return {
    port: hit.port,
    version: hit.version,
    host: hit.host,
    error: hit.error,
    manual: hit.manual,
    hostOllama: hit.port != null && hit.version ? { port: hit.port, version: hit.version } : null,
  }
}

export async function resolveOllamaChat(mode?: string | null): Promise<{
  source: OllamaChatSource
  baseUrl: string
  host: { port: number; version: string } | null
  hostError: string | null
}> {
  const persisted = normalizeOllamaMode(mode)
  const hostHit = await findHostOllama()
  const host = hostHit.port != null && hostHit.version
    ? { port: hostHit.port, version: hostHit.version }
    : null

  if (persisted === 'sidecar') {
    return { source: 'sidecar', baseUrl: sidecarOllamaUrl(), host, hostError: hostHit.error }
  }
  if (persisted === 'host') {
    if (host) return { source: 'host', baseUrl: hostOllamaUrl(host.port, hostHit.host), host, hostError: hostHit.error }
    return {
      source: 'host',
      baseUrl: hostOllamaUrl(hostHit.manual && readOllamaManualPort() ? readOllamaManualPort()! : OLLAMA_HOST_DEFAULT_PORT, hostHit.host),
      host: null,
      hostError: hostHit.error || 'Host Ollama not found',
    }
  }
  if (host) return { source: 'host', baseUrl: hostOllamaUrl(host.port, hostHit.host), host, hostError: hostHit.error }
  return { source: 'sidecar', baseUrl: sidecarOllamaUrl(), host, hostError: hostHit.error }
}
