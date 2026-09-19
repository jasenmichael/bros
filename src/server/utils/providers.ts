import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { decryptSecret, encryptSecret } from './auth'
import { getDb, providers } from './db'
import { isInternalBrosModel } from './internalBrosModel'
import { isValidOllamaPullName } from './ollamaLibrary'
import { findHostOllama, hostOllamaUrl, sidecarOllamaUrl, OLLAMA_SIDECAR_DNS } from './ollamaHost'
import { PROVIDER_PRESETS, isPopularProvider } from './providerPresets'

export type ProviderKind = 'ollama' | 'openai' | 'anthropic'

export const OLLAMA_SIDECAR_ID = 'ollama'
export const OLLAMA_HOST_ID = 'ollama-host'
export const SYSTEM_PROVIDER_IDS = [OLLAMA_SIDECAR_ID, OLLAMA_HOST_ID] as const

export { isPopularProvider, PROVIDER_PRESETS }
export { POPULAR_PROVIDER_IDS, getProviderPreset } from './providerPresets'

export type ProviderStatus = 'running' | 'stopped' | 'error'

export function isSystemProvider(id: string) {
  return id === OLLAMA_SIDECAR_ID || id === OLLAMA_HOST_ID
}

export function isReservedProviderId(id: string) {
  return isSystemProvider(id) || isPopularProvider(id)
}

export type ProviderRow = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string | null
  enabled: boolean
  hasApiKey: boolean
  config: Record<string, unknown>
}

function mapRow(row: typeof providers.$inferSelect): ProviderRow {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as ProviderKind,
    baseUrl: row.baseUrl,
    enabled: row.enabled,
    hasApiKey: Boolean(row.apiKeyEnc),
    config: row.configJson ? JSON.parse(row.configJson) : {},
  }
}

export function listProviders(): ProviderRow[] {
  return getDb().select().from(providers).all().map(mapRow)
}

export function getProvider(id: string) {
  const row = getDb().select().from(providers).where(eq(providers.id, id)).get()
  return row ? mapRow(row) : null
}

export function getProviderSecret(id: string): { row: typeof providers.$inferSelect; apiKey?: string } | null {
  const row = getDb().select().from(providers).where(eq(providers.id, id)).get()
  if (!row) return null
  return {
    row,
    apiKey: row.apiKeyEnc ? decryptSecret(row.apiKeyEnc) : undefined,
  }
}

export function upsertProvider(input: {
  id: string
  name: string
  kind: ProviderKind
  baseUrl?: string | null
  apiKey?: string | null
  enabled?: boolean
  config?: Record<string, unknown>
}) {
  const db = getDb()
  const existing = db.select().from(providers).where(eq(providers.id, input.id)).get()
  const existingConfig: Record<string, unknown> = existing?.configJson
    ? JSON.parse(existing.configJson) as Record<string, unknown>
    : {}
  // Partial config patches merge into existing so callers do not wipe useGpu / customModels.
  const nextConfig = input.config === undefined
    ? existingConfig
    : { ...existingConfig, ...input.config }
  const values = {
    id: input.id,
    name: input.name,
    kind: input.kind,
    baseUrl: input.baseUrl ?? null,
    apiKeyEnc: input.apiKey === undefined || input.apiKey === null
      ? (existing?.apiKeyEnc ?? null)
      : (input.apiKey ? encryptSecret(input.apiKey) : null),
    enabled: input.enabled ?? (existing ? Boolean(existing.enabled) : true),
    configJson: JSON.stringify(nextConfig),
  }
  if (existing) db.update(providers).set(values).where(eq(providers.id, input.id)).run()
  else db.insert(providers).values(values).run()
  return getProvider(input.id)
}

export function deleteProvider(id: string) {
  if (isSystemProvider(id) || isPopularProvider(id)) {
    throw createError({ statusCode: 400, statusMessage: `Cannot delete built-in ${id} provider` })
  }
  getDb().delete(providers).where(eq(providers.id, id)).run()
}

/** Chat picker only. Does not start/stop sidecars, host Ollama, or other providers. */
export function isChatSelectionEnabled(row: { enabled?: boolean } | null | undefined) {
  return row?.enabled !== false
}

export function filterChatProviders<T extends { enabled?: boolean }>(rows: T[]): T[] {
  return rows.filter((p) => isChatSelectionEnabled(p))
}

export function setProviderEnabled(id: string, enabled: boolean) {
  const existing = getProvider(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }
  return upsertProvider({
    id: existing.id,
    name: existing.name,
    kind: existing.kind,
    baseUrl: existing.baseUrl,
    enabled,
  })
}

export function ensureDefaultProviders() {
  const sidecar = getProvider(OLLAMA_SIDECAR_ID)
  if (!sidecar) {
    upsertProvider({
      id: OLLAMA_SIDECAR_ID,
      name: 'Ollama sidecar',
      kind: 'ollama',
      baseUrl: OLLAMA_SIDECAR_DNS,
      config: {},
    })
  }
  else if (sidecar.name === 'Ollama') {
    upsertProvider({
      id: OLLAMA_SIDECAR_ID,
      name: 'Ollama sidecar',
      kind: 'ollama',
      baseUrl: sidecar.baseUrl || OLLAMA_SIDECAR_DNS,
    })
  }
  if (!getProvider(OLLAMA_HOST_ID)) {
    upsertProvider({
      id: OLLAMA_HOST_ID,
      name: 'Ollama host',
      kind: 'ollama',
      baseUrl: hostOllamaUrl(11434),
      config: {},
    })
  }
  for (const preset of PROVIDER_PRESETS) {
    if (getProvider(preset.id)) continue
    upsertProvider({
      id: preset.id,
      name: preset.name,
      kind: 'openai',
      baseUrl: preset.baseUrl,
      enabled: true,
      config: { models: [...preset.models] },
    })
  }
}

export function listCustomOllamaModels(providerId = OLLAMA_SIDECAR_ID): string[] {
  const raw = getProvider(providerId)?.config?.customModels
  if (!Array.isArray(raw)) return []
  return raw.filter((n): n is string => (
    typeof n === 'string' && isValidOllamaPullName(n) && !isInternalBrosModel(n)
  ))
}

/** Append a typed/community pull name to an Ollama provider config.customModels. */
export function rememberCustomOllamaModel(name: string, providerId = OLLAMA_SIDECAR_ID): string[] {
  ensureDefaultProviders()
  const trimmed = name.trim()
  const existing = listCustomOllamaModels(providerId)
  if (!isValidOllamaPullName(trimmed) || isInternalBrosModel(trimmed) || existing.includes(trimmed)) return existing
  const next = [...existing, trimmed]
  const p = getProvider(providerId)
  upsertProvider({
    id: providerId,
    name: p?.name || (providerId === OLLAMA_HOST_ID ? 'Ollama host' : 'Ollama sidecar'),
    kind: 'ollama',
    baseUrl: p?.baseUrl,
    config: { customModels: next },
  })
  return next
}

export function listConfiguredOpenAIModels(providerId: string): string[] {
  const raw = getProvider(providerId)?.config?.models
  if (!Array.isArray(raw)) return []
  return raw.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim())
}

export function isRetryablePullError(message: string): boolean {
  return /TLS handshake timeout|timeout|i\/o timeout|ECONNRESET|ECONNREFUSED|502|503|504|temporar(?:y|ily)|unavailable|EOF/i.test(message)
}

async function readOllamaError(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string }
    return parsed.error || parsed.message || text || `Ollama error ${res.status}`
  } catch {
    return text || `Ollama error ${res.status}`
  }
}

/**
 * Use GPU switch: auto-on once when GPU is present and `useGpu` was never set.
 * Explicit `false` stays false. No GPU → switch off in UI; do not write a preference.
 */
export function ensureDefaultUseGpu(gpuAvailable: boolean): boolean {
  ensureDefaultProviders()
  const existing = getProvider('ollama')
  const raw = existing?.config?.useGpu
  if (gpuAvailable && (raw === undefined || raw === null)) {
    upsertProvider({
      id: 'ollama',
      name: existing?.name || 'Ollama sidecar',
      kind: 'ollama',
      baseUrl: existing?.baseUrl,
      config: { useGpu: true },
    })
    return true
  }
  return Boolean(raw) && gpuAvailable
}

export async function listOllamaModels(baseUrl: string, providerId = OLLAMA_SIDECAR_ID) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Ollama error ${res.status}` })
  const data = await res.json() as { models?: Array<{ name: string; size?: number; modified_at?: string; details?: unknown }> }
  return (data.models || [])
    .filter((m) => !isInternalBrosModel(m.name))
    .map((m) => ({
      id: `${providerId}/${m.name}`,
      name: m.name,
      provider: providerId,
      size: m.size,
      modifiedAt: m.modified_at,
      details: m.details,
    }))
}

export async function probeOllamaRunning(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/version`, {
      signal: AbortSignal.timeout(800),
    })
    return res.ok
  }
  catch {
    return false
  }
}

export async function listOpenAIModelIds(providerId: string): Promise<string[]> {
  const configured = listConfiguredOpenAIModels(providerId)
  const secret = getProviderSecret(providerId)
  const base = secret?.row.baseUrl?.replace(/\/$/, '')
  if (!base || !secret.apiKey) return configured
  try {
    const headers: Record<string, string> = {}
    if (secret.apiKey) headers.authorization = `Bearer ${secret.apiKey}`
    const res = await fetch(`${base}/models`, {
      headers,
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return configured
    const json = await res.json() as { data?: Array<{ id?: string }> }
    const remote = (json.data || []).map((m) => m.id).filter((id): id is string => Boolean(id))
    return [...new Set([...configured, ...remote])]
  }
  catch {
    return configured
  }
}

export async function pullOllamaModel(baseUrl: string, name: string) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, stream: false }),
  })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: await res.text() })
  return res.json()
}

export type PullProgressEvent = {
  status?: string
  digest?: string
  total?: number
  completed?: number
  error?: string
}

/** Stream Ollama pull NDJSON progress events. */
export async function* pullOllamaModelStream(baseUrl: string, name: string): AsyncGenerator<PullProgressEvent> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, stream: true }),
  })
  if (!res.ok) {
    throw createError({ statusCode: 502, statusMessage: await readOllamaError(res) })
  }
  if (!res.body) {
    throw createError({ statusCode: 502, statusMessage: 'No pull stream body' })
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        yield JSON.parse(trimmed) as PullProgressEvent
      } catch {
        // ignore malformed chunk
      }
    }
  }
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer.trim()) as PullProgressEvent
    } catch {
      // ignore
    }
  }
}

export async function deleteOllamaModel(baseUrl: string, name: string) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/delete`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: await res.text() })
  return { ok: true }
}

export async function ollamaBaseUrlFor(providerId = OLLAMA_SIDECAR_ID): Promise<string> {
  if (providerId === OLLAMA_HOST_ID) {
    const hit = await findHostOllama()
    if (hit.port != null) return hostOllamaUrl(hit.port, hit.host)
    const p = getProvider(OLLAMA_HOST_ID)
    return p?.baseUrl || hostOllamaUrl(11434)
  }
  return sidecarOllamaUrl()
}

/** @deprecated use ollamaBaseUrlFor */
export async function ollamaBaseUrlFromProvider(): Promise<string> {
  return ollamaBaseUrlFor(OLLAMA_SIDECAR_ID)
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'statusMessage' in err && typeof (err as { statusMessage?: unknown }).statusMessage === 'string') {
    return (err as { statusMessage: string }).statusMessage
  }
  return err instanceof Error ? err.message : String(err)
}

/** One retry on registry timeout / 5xx. Second failure is yielded, never faked as success. */
export async function* pullOllamaModelStreamWithRetry(baseUrl: string, name: string): AsyncGenerator<PullProgressEvent> {
  try {
    let retryable: string | undefined
    for await (const evt of pullOllamaModelStream(baseUrl, name)) {
      if (evt.error && isRetryablePullError(evt.error)) {
        retryable = evt.error
        break
      }
      yield evt
      if (evt.error) return
    }
    if (!retryable) return
    yield { status: `Retrying after: ${retryable}` }
    for await (const evt of pullOllamaModelStream(baseUrl, name)) {
      yield evt
    }
  } catch (err) {
    const message = errorMessage(err)
    if (!isRetryablePullError(message)) throw err
    yield { status: `Retrying after: ${message}` }
    for await (const evt of pullOllamaModelStream(baseUrl, name)) {
      yield evt
    }
  }
}
