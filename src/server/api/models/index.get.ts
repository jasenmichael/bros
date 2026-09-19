import {
  ensureDefaultProviders,
  listOllamaModels,
  listOpenAIModelIds,
  listProviders,
  ollamaBaseUrlFor,
  probeOllamaRunning,
  isPopularProvider,
  POPULAR_PROVIDER_IDS,
  OLLAMA_HOST_ID,
  OLLAMA_SIDECAR_ID,
  type ProviderStatus,
} from '../../utils/providers'
import { ensureInternalBrosModel } from '../../utils/internalBrosModel'
import { findHostOllama, readOllamaManualPort, sidecarOllamaUrl, OLLAMA_SIDECAR_DNS, OLLAMA_SIDECAR_PUBLISH } from '../../utils/ollamaHost'

export default defineEventHandler(async () => {
  ensureDefaultProviders()
  const rows = listProviders()
  const hostHit = await findHostOllama()
  const host = hostHit.port != null && hostHit.version
    ? { port: hostHit.port, version: hostHit.version }
    : null

  const ollamaModelsByProvider: Record<string, Awaited<ReturnType<typeof listOllamaModels>>> = {}
  const openaiModelsByProvider: Record<string, string[]> = {}
  const errors: Record<string, string> = {}

  const sidecarRunning = await probeOllamaRunning(sidecarOllamaUrl())
  if (sidecarRunning) {
    await ensureInternalBrosModel()
  }

  for (const p of rows) {
    if (p.kind === 'ollama') {
      const baseUrl = await ollamaBaseUrlFor(p.id)
      try {
        ollamaModelsByProvider[p.id] = await listOllamaModels(baseUrl, p.id)
      }
      catch (err) {
        ollamaModelsByProvider[p.id] = []
        errors[p.id] = err instanceof Error ? err.message : String(err)
      }
    }
    if (p.kind === 'openai' || p.kind === 'anthropic') {
      openaiModelsByProvider[p.id] = await listOpenAIModelIds(p.id)
    }
  }

  const providers = rows.map((p) => {
    let status: ProviderStatus = 'stopped'
    let statusMessage: string | null = null
    let port: number | null = null
    if (p.id === OLLAMA_SIDECAR_ID) {
      status = sidecarRunning ? 'running' : 'stopped'
      port = OLLAMA_SIDECAR_PUBLISH
      if (errors[p.id] && sidecarRunning) status = 'error'
      if (errors[p.id]) statusMessage = errors[p.id]
    }
    else if (p.id === OLLAMA_HOST_ID) {
      const manual = readOllamaManualPort()
      if (host) {
        status = 'running'
        port = host.port
      }
      else if (hostHit.error) {
        status = 'error'
        statusMessage = hostHit.error
        port = manual
      }
      else {
        status = 'stopped'
        statusMessage = 'Host Ollama is not running (scanned 11434, 11436, 22000).'
        port = manual
      }
    }
    else if (isPopularProvider(p.id)) {
      status = p.enabled && p.hasApiKey ? 'running' : 'stopped'
      if (!p.hasApiKey) statusMessage = 'Need an API key'
    }
    else if (p.kind === 'openai' || p.kind === 'anthropic') {
      status = p.enabled && (p.baseUrl || p.hasApiKey) ? 'running' : 'stopped'
    }
    return {
      ...p,
      status,
      statusMessage,
      port,
      popular: isPopularProvider(p.id),
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
    ollamaModelsByProvider,
    openaiModelsByProvider,
    ollamaError: errors[OLLAMA_SIDECAR_ID] || null,
    hostOllamaError: hostHit.error,
    sidecarPublish: OLLAMA_SIDECAR_PUBLISH,
    sidecarDns: OLLAMA_SIDECAR_DNS,
    hostOllama: host,
    hostProbePort: readOllamaManualPort(),
  }
})
