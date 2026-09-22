import { isOllamaModelChatEnabled, parseDisabledOllamaModels } from '../../app/utils/ollamaDisabledModels'
import { ensureInternalBrosModel } from './internalBrosModel'
import { clearDonePullsForInstalled, listActivePullsByProvider } from './ollamaPullJobs'
import { assertHostOllamaVisible, isHostOllamaEnabled } from './hostOllamaSettings'
import { findHostOllama, readOllamaManualPort, sidecarOllamaUrl, OLLAMA_SIDECAR_DNS, OLLAMA_SIDECAR_PUBLISH } from './ollamaHost'
import { getProviderPreset, isPopularProvider, POPULAR_PROVIDER_IDS } from './providerPresets'
import {
  disableUnhealthyKeyedChat,
  ensureDefaultProviders,
  getProvider,
  healthLabel,
  listOllamaModels,
  listOpenAIModelIds,
  listProviders,
  ollamaBaseUrlFor,
  probeOllamaRunning,
  OLLAMA_HOST_ID,
  OLLAMA_SIDECAR_ID,
  type ProviderHealth,
  type ProviderStatus,
} from './providers'

export type ProviderModelRow = {
  id: string
  name: string
  enabled: boolean
  size?: number
}

export async function listProviderModels(id: string) {
  assertHostOllamaVisible(id)
  const p = getProvider(id)
  if (!p) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }
  const disabled = parseDisabledOllamaModels(p.config)
  let error: string | null = null
  let models: ProviderModelRow[] = []

  if (p.kind === 'ollama') {
    try {
      const listed = await listOllamaModels(await ollamaBaseUrlFor(p.id), p.id)
      clearDonePullsForInstalled(p.id, listed.map((m) => m.name))
      models = listed.map((m) => ({
        id: m.id,
        name: m.name,
        size: m.size,
        enabled: isOllamaModelChatEnabled(m.name, disabled),
      }))
    }
    catch (err) {
      error = err instanceof Error ? err.message : String(err)
      models = []
    }
  }
  else {
    const names = await listOpenAIModelIds(p.id)
    models = names.map((name) => ({
      id: `${p.id}/${name}`,
      name,
      enabled: isOllamaModelChatEnabled(name, disabled),
    }))
  }

  return {
    id: p.id,
    models,
    activePulls: p.kind === 'ollama' ? (listActivePullsByProvider()[p.id] || []) : [],
    error,
  }
}

export async function buildProvidersView() {
  ensureDefaultProviders()
  const keyedHealth = await disableUnhealthyKeyedChat()
  const hostEnabled = isHostOllamaEnabled()
  const rows = listProviders().filter((p) => p.id !== OLLAMA_HOST_ID || hostEnabled)
  const hostHit = hostEnabled
    ? await findHostOllama()
    : { port: null, version: null, host: null, error: null, manual: false }
  const host = hostHit.port != null && hostHit.version
    ? { port: hostHit.port, version: hostHit.version }
    : null

  const errors: Record<string, string> = {}
  const modelsByProvider: Record<string, ProviderModelRow[]> = {}

  const sidecarRunning = await probeOllamaRunning(sidecarOllamaUrl())
  if (sidecarRunning) {
    await ensureInternalBrosModel()
  }

  for (const p of rows) {
    const listed = await listProviderModels(p.id)
    modelsByProvider[p.id] = listed.models
    if (listed.error) errors[p.id] = listed.error
  }

  const providers = rows.map((p) => {
    let health: ProviderHealth
    let statusMessage: string | null = null
    let port: number | null = null
    if (p.id === OLLAMA_SIDECAR_ID) {
      health = sidecarRunning
        ? { ok: true, kind: 'ready', message: 'Ready' }
        : { ok: false, kind: 'unreachable', message: 'Ollama sidecar is unreachable' }
      port = OLLAMA_SIDECAR_PUBLISH
      if (errors[p.id]) statusMessage = errors[p.id]
    }
    else if (p.id === OLLAMA_HOST_ID) {
      const manual = readOllamaManualPort()
      if (host) {
        health = { ok: true, kind: 'ready', message: 'Ready' }
        port = host.port
      }
      else if (hostHit.error) {
        health = { ok: false, kind: 'unreachable', message: hostHit.error }
        statusMessage = hostHit.error
        port = manual
      }
      else {
        health = {
          ok: false,
          kind: 'unreachable',
          message: 'Host Ollama is unreachable.',
        }
        statusMessage = health.message
        port = manual
      }
    }
    else {
      health = keyedHealth.get(p.id) || { ok: false, kind: 'unreachable', message: 'Unreachable' }
      statusMessage = health.kind === 'ready' ? null : health.message
    }
    const status: ProviderStatus = health.kind
    return {
      ...p,
      status,
      statusLabel: healthLabel(status),
      statusMessage,
      port,
      popular: isPopularProvider(p.id),
      siteUrl: getProviderPreset(p.id)?.siteUrl ?? null,
      models: modelsByProvider[p.id] || [],
    }
  })

  const popularIndex = new Map(POPULAR_PROVIDER_IDS.map((id, i) => [id, i]))
  const rank = (id: string) => {
    if (id === OLLAMA_SIDECAR_ID) return 0
    if (id === OLLAMA_HOST_ID) return 1
    if (popularIndex.has(id)) return 2 + (popularIndex.get(id) || 0)
    return 100
  }
  providers.sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))

  return {
    providers,
    activePulls: listActivePullsByProvider(),
    ollamaError: errors[OLLAMA_SIDECAR_ID] || null,
    hostOllamaError: hostHit.error,
    sidecarPublish: OLLAMA_SIDECAR_PUBLISH,
    sidecarDns: OLLAMA_SIDECAR_DNS,
    hostOllama: host,
    hostProbePort: readOllamaManualPort(),
  }
}

export function requireProviderId(event: { context?: { params?: Record<string, string> } } | Parameters<typeof getRouterParam>[0]) {
  const id = getRouterParam(event as Parameters<typeof getRouterParam>[0], 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  assertHostOllamaVisible(id)
  return id
}

export function requireOllamaProvider(id: string) {
  assertHostOllamaVisible(id)
  const p = getProvider(id)
  if (!p) throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  if (p.kind !== 'ollama') {
    throw createError({ statusCode: 400, statusMessage: 'Ollama provider required' })
  }
  return p
}
