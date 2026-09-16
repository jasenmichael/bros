import { eq } from 'drizzle-orm'
import { decryptSecret, encryptSecret } from './auth'
import { getDb, providers } from './db'
import { isValidOllamaPullName } from './ollamaLibrary'

export type ProviderKind = 'ollama' | 'openai' | 'anthropic'

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
  // Partial config patches merge into existing so callers (e.g. mode-only) do not wipe useGpu.
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
    enabled: input.enabled ?? true,
    configJson: JSON.stringify(nextConfig),
  }
  if (existing) db.update(providers).set(values).where(eq(providers.id, input.id)).run()
  else db.insert(providers).values(values).run()
  return getProvider(input.id)
}

export function deleteProvider(id: string) {
  getDb().delete(providers).where(eq(providers.id, id)).run()
}

export function ensureDefaultProviders() {
  if (getProvider('ollama')) return
  upsertProvider({
    id: 'ollama',
    name: 'Ollama',
    kind: 'ollama',
    baseUrl: 'http://ollama:11434',
    config: { mode: 'sidecar' },
  })
}

export function listCustomOllamaModels(): string[] {
  const raw = getProvider('ollama')?.config?.customModels
  if (!Array.isArray(raw)) return []
  return raw.filter((n): n is string => typeof n === 'string' && isValidOllamaPullName(n))
}

/** Append a typed/community pull name to ollama provider config.customModels. */
export function rememberCustomOllamaModel(name: string): string[] {
  ensureDefaultProviders()
  const trimmed = name.trim()
  const existing = listCustomOllamaModels()
  if (!isValidOllamaPullName(trimmed) || existing.includes(trimmed)) return existing
  const next = [...existing, trimmed]
  const p = getProvider('ollama')
  upsertProvider({
    id: 'ollama',
    name: p?.name || 'Ollama',
    kind: 'ollama',
    baseUrl: p?.baseUrl,
    config: { customModels: next },
  })
  return next
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
      name: existing?.name || 'Ollama',
      kind: 'ollama',
      baseUrl: existing?.baseUrl,
      config: { useGpu: true },
    })
    return true
  }
  return Boolean(raw) && gpuAvailable
}

export async function listOllamaModels(baseUrl: string) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`)
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Ollama error ${res.status}` })
  const data = await res.json() as { models?: Array<{ name: string; size?: number; modified_at?: string; details?: unknown }> }
  return (data.models || []).map((m) => ({
    id: `ollama/${m.name}`,
    name: m.name,
    provider: 'ollama',
    size: m.size,
    modifiedAt: m.modified_at,
    details: m.details,
  }))
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

export function ollamaBaseUrlFromProvider(): string {
  const p = getProvider('ollama')
  const mode = (p?.config?.mode as string) || 'sidecar'
  if (mode === 'external' && p?.baseUrl) return p.baseUrl
  return p?.baseUrl || 'http://ollama:11434'
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
