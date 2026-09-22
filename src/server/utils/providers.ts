import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { nextDisabledOllamaModels, parseDisabledOllamaModels } from '../../app/utils/ollamaDisabledModels'
import { decryptSecret, encryptSecret } from './auth'
import { getDb, providers } from './db'
import { isInternalBrosModel, refuseInternalBrosModel } from './internalBrosModel'
import { isValidOllamaPullName } from './ollamaLibrary'
import { findHostOllama, hostOllamaUrl, sidecarOllamaUrl, OLLAMA_SIDECAR_DNS } from './ollamaHost'
import { PROVIDER_PRESETS, getProviderPreset, isPopularProvider } from './providerPresets'

export type ProviderKind = 'ollama' | 'openai' | 'anthropic'

export const OLLAMA_SIDECAR_ID = 'ollama'
export const OLLAMA_HOST_ID = 'ollama-host'
export const SYSTEM_PROVIDER_IDS = [OLLAMA_SIDECAR_ID, OLLAMA_HOST_ID] as const

/** Provider-row health. Not sidecar process lifecycle (that stays running/stopped on Status). */
export type ProviderStatus = 'ready' | 'needs_key' | 'invalid_key' | 'unreachable'

export type ProviderHealth = {
  ok: boolean
  kind: ProviderStatus
  message: string
}

export function healthLabel(kind: ProviderStatus) {
  if (kind === 'ready') return 'Ready'
  if (kind === 'needs_key') return 'Need an API key'
  if (kind === 'invalid_key') return 'Invalid key'
  return 'Unreachable'
}

export function providerNeedsApiKey(kind: ProviderKind) {
  return kind === 'openai' || kind === 'anthropic'
}

/** Ollama sidecar + host start Chat-on. Popular/custom start Chat-off. */
export function defaultChatEnabled(kind: ProviderKind) {
  return kind === 'ollama'
}

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
  // Partial config patches merge into existing so callers do not wipe useGpu / customModels / disabledModels.
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
    enabled: input.enabled ?? (existing ? Boolean(existing.enabled) : defaultChatEnabled(input.kind)),
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

export async function setProviderEnabled(id: string, enabled: boolean) {
  const existing = getProvider(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }
  if (enabled) {
    const health = await probeProviderHealth(id)
    if (!health.ok) {
      throw createError({ statusCode: 400, statusMessage: health.message })
    }
  }
  return upsertProvider({
    id: existing.id,
    name: existing.name,
    kind: existing.kind,
    baseUrl: existing.baseUrl,
    enabled,
  })
}

/** After a key/config save: auto-enable Chat when probe succeeds; force Chat off when it fails. */
export async function persistProviderAndSyncChat(input: {
  id: string
  name: string
  kind: ProviderKind
  baseUrl?: string | null
  apiKey?: string | null
  enabled?: boolean
  config?: Record<string, unknown>
}) {
  const row = upsertProvider(input)
  if (!row || row.kind === 'ollama') return row
  const health = await probeProviderHealth(row.id)
  const wantEnable = input.enabled === true || Boolean(input.apiKey)
  if (wantEnable) {
    if (!health.ok) {
      upsertProvider({
        id: row.id,
        name: row.name,
        kind: row.kind,
        baseUrl: row.baseUrl,
        enabled: false,
      })
      throw createError({ statusCode: 400, statusMessage: health.message })
    }
    return upsertProvider({
      id: row.id,
      name: row.name,
      kind: row.kind,
      baseUrl: row.baseUrl,
      enabled: true,
    })
  }
  if (row.enabled && !health.ok) {
    return upsertProvider({
      id: row.id,
      name: row.name,
      kind: row.kind,
      baseUrl: row.baseUrl,
      enabled: false,
    })
  }
  return getProvider(row.id)
}

/**
 * Existing DBs: turn Chat off only for keyed rows with no key (old default-on).
 * Failed / invalid-key probes stay display-only — GET /api/providers must not persist Chat-off.
 * Leave Ollama Chat as-is.
 */
export async function disableUnhealthyKeyedChat() {
  const healthById = new Map<string, ProviderHealth>()
  for (const p of listProviders()) {
    if (p.kind === 'ollama') continue
    const health = await probeProviderHealth(p.id)
    healthById.set(p.id, health)
    if (p.enabled && health.kind === 'needs_key') {
      upsertProvider({
        id: p.id,
        name: p.name,
        kind: p.kind,
        baseUrl: p.baseUrl,
        enabled: false,
      })
    }
  }
  return healthById
}

const SIDECAR_LEGACY_NAMES = new Set(['Ollama', 'Ollama sidecar'])
const HOST_LEGACY_NAMES = new Set(['Ollama host'])

export function ensureDefaultProviders() {
  const sidecar = getProvider(OLLAMA_SIDECAR_ID)
  if (!sidecar) {
    upsertProvider({
      id: OLLAMA_SIDECAR_ID,
      name: 'Ollama (core)',
      kind: 'ollama',
      baseUrl: OLLAMA_SIDECAR_DNS,
      config: {},
    })
  }
  else if (SIDECAR_LEGACY_NAMES.has(sidecar.name)) {
    upsertProvider({
      id: OLLAMA_SIDECAR_ID,
      name: 'Ollama (core)',
      kind: 'ollama',
      baseUrl: sidecar.baseUrl || OLLAMA_SIDECAR_DNS,
    })
  }
  const host = getProvider(OLLAMA_HOST_ID)
  if (!host) {
    upsertProvider({
      id: OLLAMA_HOST_ID,
      name: 'Ollama (host)',
      kind: 'ollama',
      baseUrl: hostOllamaUrl(11434),
      config: {},
    })
  }
  else if (HOST_LEGACY_NAMES.has(host.name)) {
    upsertProvider({
      id: OLLAMA_HOST_ID,
      name: 'Ollama (host)',
      kind: 'ollama',
      baseUrl: host.baseUrl || hostOllamaUrl(11434),
    })
  }
  for (const preset of PROVIDER_PRESETS) {
    if (getProvider(preset.id)) continue
    upsertProvider({
      id: preset.id,
      name: preset.name,
      kind: 'openai',
      baseUrl: preset.baseUrl,
      enabled: false,
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

export function listDisabledOllamaModels(providerId: string): string[] {
  return parseDisabledOllamaModels(getProvider(providerId)?.config)
}

/** Chat-off names for one provider. Default on unless the name is already stored. */
export function setOllamaModelChatEnabled(providerId: string, name: string, enabled: boolean): string[] {
  const p = getProvider(providerId)
  if (!p) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }
  const trimmed = name.trim()
  if (!trimmed) throw createError({ statusCode: 400, statusMessage: 'model required' })
  refuseInternalBrosModel(trimmed)
  const next = nextDisabledOllamaModels(listDisabledOllamaModels(providerId), trimmed, enabled)
  upsertProvider({
    id: p.id,
    name: p.name,
    kind: p.kind,
    baseUrl: p.baseUrl,
    config: { disabledModels: next },
  })
  return next
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
    name: p?.name || (providerId === OLLAMA_HOST_ID ? 'Ollama (host)' : 'Ollama (core)'),
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
      name: existing?.name || 'Ollama (core)',
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

function classifyHttpHealth(status: number, body: string): ProviderHealth {
  if (status === 401 || status === 403) {
    return { ok: false, kind: 'invalid_key', message: 'Invalid key' }
  }
  const detail = body.replace(/\s+/g, ' ').trim().slice(0, 160)
  return {
    ok: false,
    kind: 'unreachable',
    message: detail || `Unreachable (${status})`,
  }
}

/** Live key + endpoint check. Never treat a non-empty key as healthy by itself. */
export async function probeProviderHealth(id: string): Promise<ProviderHealth> {
  const secret = getProviderSecret(id)
  if (!secret) return { ok: false, kind: 'unreachable', message: 'Provider not found' }
  const kind = secret.row.kind as ProviderKind

  if (kind === 'ollama') {
    const base = await ollamaBaseUrlFor(id)
    const ok = await probeOllamaRunning(base)
    if (ok) return { ok: true, kind: 'ready', message: 'Ready' }
    return {
      ok: false,
      kind: 'unreachable',
      message: id === OLLAMA_HOST_ID
        ? 'Host Ollama is unreachable.'
        : 'Ollama sidecar is unreachable',
    }
  }

  if (!secret.apiKey) {
    return { ok: false, kind: 'needs_key', message: 'Need an API key' }
  }
  const base = secret.row.baseUrl?.replace(/\/$/, '')
  if (!base) {
    return { ok: false, kind: 'unreachable', message: 'Need a base URL' }
  }
  try {
    const extra = getProviderPreset(id)?.headers || {}
    const res = await fetch(`${base}/models`, {
      headers: {
        authorization: `Bearer ${secret.apiKey}`,
        ...extra,
      },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return classifyHttpHealth(res.status, text)
    }
    return { ok: true, kind: 'ready', message: 'Ready' }
  }
  catch (err) {
    const detail = err instanceof Error ? err.message : 'Unreachable'
    return { ok: false, kind: 'unreachable', message: detail || 'Unreachable' }
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
export async function* pullOllamaModelStream(
  baseUrl: string,
  name: string,
  signal?: AbortSignal,
): AsyncGenerator<PullProgressEvent> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, stream: true }),
    signal,
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
  const onAbort = () => {
    void reader.cancel()
  }
  signal?.addEventListener('abort', onAbort)
  try {
    while (true) {
      if (signal?.aborted) break
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
  } finally {
    signal?.removeEventListener('abort', onAbort)
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

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))
}

/** One retry on registry timeout / 5xx. Second failure is yielded, never faked as success. */
export async function* pullOllamaModelStreamWithRetry(
  baseUrl: string,
  name: string,
  signal?: AbortSignal,
): AsyncGenerator<PullProgressEvent> {
  try {
    let retryable: string | undefined
    for await (const evt of pullOllamaModelStream(baseUrl, name, signal)) {
      if (signal?.aborted) return
      if (evt.error && isRetryablePullError(evt.error)) {
        retryable = evt.error
        break
      }
      yield evt
      if (evt.error) return
    }
    if (!retryable || signal?.aborted) return
    yield { status: `Retrying after: ${retryable}` }
    for await (const evt of pullOllamaModelStream(baseUrl, name, signal)) {
      yield evt
    }
  } catch (err) {
    if (signal?.aborted || isAbortError(err)) throw err
    const message = errorMessage(err)
    if (!isRetryablePullError(message)) throw err
    yield { status: `Retrying after: ${message}` }
    for await (const evt of pullOllamaModelStream(baseUrl, name, signal)) {
      yield evt
    }
  }
}
