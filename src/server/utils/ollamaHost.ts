import { eq } from 'drizzle-orm'
import { getDb, sidecarSettings } from './db'
import { dockerHostName } from './hostProbe'
import { getSidecar, projectName } from './sidecars'

export const OLLAMA_SIDECAR_DNS = 'http://ollama:11434'
export const OLLAMA_SIDECAR_PUBLISH = 11435
export const OLLAMA_HOST_SCAN_PORTS = [11434, 11436, 22000] as const
export const OLLAMA_BROS_PROJECT = projectName('ollama')

export type OllamaChatSource = 'host' | 'sidecar' | 'external'

export type HostOllamaHit = {
  port: number | null
  version: string | null
  error: string | null
  manual: boolean
}

const CACHE_MS = 30_000
let cache: { at: number; key: string; value: HostOllamaHit } | null = null
let testManualPort: number | null | undefined

export function resetOllamaHostCache() {
  cache = null
  testManualPort = undefined
}

/** @deprecated use resetOllamaHostCache */
export const resetOllamaHostCacheForTests = resetOllamaHostCache

/** Test-only: skip SQLite when set (including `null`). */
export function setOllamaManualPortForTests(port: number | null) {
  testManualPort = port
  cache = null
}

export function hostOllamaUrl(port: number): string {
  return `http://${dockerHostName()}:${port}`
}

export async function probeOllamaVersion(port: number, timeoutMs = 800): Promise<{ version: string } | null> {
  const hosts = Array.from(new Set([
    dockerHostName(),
    'host.docker.internal',
    '172.17.0.1',
  ]))
  for (const host of hosts) {
    try {
      const res = await fetch(`http://${host}:${port}/api/version`, {
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) continue
      const json = await res.json() as { version?: unknown }
      if (typeof json.version === 'string' && json.version) return { version: json.version }
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

export function readOllamaManualPort(): number | null {
  if (testManualPort !== undefined) return testManualPort
  const row = getDb().select().from(sidecarSettings).where(eq(sidecarSettings.sidecarId, 'ollama')).get()
  const n = row?.hostProbePort
  return typeof n === 'number' && n > 0 ? n : null
}

export async function findHostOllama(): Promise<HostOllamaHit> {
  const manual = readOllamaManualPort()
  const key = `m:${manual ?? ''}`
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.value

  const store = (value: HostOllamaHit) => {
    cache = { at: Date.now(), key, value }
    return value
  }

  if (manual != null) {
    if (await ownerProject(manual) === OLLAMA_BROS_PROJECT) {
      return store({
        port: null,
        version: null,
        error: `Port ${manual} is the Bros Ollama sidecar, not a host install.`,
        manual: true,
      })
    }
    const hit = await probeOllamaVersion(manual)
    if (!hit) {
      return store({
        port: null,
        version: null,
        error: `No Ollama on :${manual}`,
        manual: true,
      })
    }
    return store({ port: manual, version: hit.version, error: null, manual: true })
  }

  const fromYaml = getSidecar('ollama')?.hostProbe?.ports
  const ports = fromYaml?.length ? fromYaml : [...OLLAMA_HOST_SCAN_PORTS]
  for (const port of ports) {
    if (await ownerProject(port) === OLLAMA_BROS_PROJECT) continue
    const hit = await probeOllamaVersion(port)
    if (hit) return store({ port, version: hit.version, error: null, manual: false })
  }
  return store({ port: null, version: null, error: null, manual: false })
}

export async function resolveOllamaChat(mode?: string | null): Promise<{
  source: OllamaChatSource
  baseUrl: string
  host: { port: number; version: string } | null
  hostError: string | null
}> {
  const hostHit = await findHostOllama()
  const host = hostHit.port != null && hostHit.version
    ? { port: hostHit.port, version: hostHit.version }
    : null

  if (mode === 'external') {
    return { source: 'external', baseUrl: '', host, hostError: hostHit.error }
  }
  if (mode === 'sidecar') {
    return { source: 'sidecar', baseUrl: OLLAMA_SIDECAR_DNS, host, hostError: hostHit.error }
  }
  if (mode === 'host') {
    if (host) return { source: 'host', baseUrl: hostOllamaUrl(host.port), host, hostError: hostHit.error }
    return {
      source: 'host',
      baseUrl: hostOllamaUrl(hostHit.manual && readOllamaManualPort() ? readOllamaManualPort()! : 11434),
      host: null,
      hostError: hostHit.error || 'Host Ollama not found',
    }
  }
  if (host) return { source: 'host', baseUrl: hostOllamaUrl(host.port), host, hostError: hostHit.error }
  return { source: 'sidecar', baseUrl: OLLAMA_SIDECAR_DNS, host, hostError: hostHit.error }
}
