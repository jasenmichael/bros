import {
  ensureDefaultProviders,
  listOllamaModels,
  listOpenAIModelIds,
  listProviders,
  ollamaBaseUrlFor,
  probeOllamaRunning,
  OLLAMA_HOST_ID,
  OLLAMA_SIDECAR_ID,
  type ProviderStatus,
} from '../../utils/providers'
import { findHostOllama, readOllamaManualPort, OLLAMA_SIDECAR_DNS, OLLAMA_SIDECAR_PUBLISH } from '../../utils/ollamaHost'

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

  const sidecarRunning = await probeOllamaRunning(OLLAMA_SIDECAR_DNS)

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
    else if (p.kind === 'openai' || p.kind === 'anthropic') {
      status = p.enabled && (p.baseUrl || p.hasApiKey) ? 'running' : 'stopped'
    }
    return { ...p, status, statusMessage, port }
  })

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
