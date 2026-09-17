import {
  ensureDefaultProviders,
  listOllamaModels,
  listProviders,
  ollamaBaseUrlFromProvider,
} from '../../utils/providers'
import { OLLAMA_SIDECAR_DNS, OLLAMA_SIDECAR_PUBLISH, resolveOllamaChat } from '../../utils/ollamaHost'

export default defineEventHandler(async () => {
  ensureDefaultProviders()
  const providers = listProviders()
  const ollama = providers.find((p) => p.id === 'ollama')
  const mode = ollama?.config?.mode as string | undefined
  const chat = await resolveOllamaChat(mode)
  const baseUrl = await ollamaBaseUrlFromProvider()
  let ollamaModels: Awaited<ReturnType<typeof listOllamaModels>> = []
  let ollamaError: string | null = null
  try {
    ollamaModels = await listOllamaModels(baseUrl)
  } catch (err) {
    ollamaError = err instanceof Error ? err.message : String(err)
  }
  return {
    providers,
    ollamaModels,
    ollamaError,
    ollamaBaseUrl: baseUrl,
    ollamaSource: chat.source,
    hostOllama: chat.host,
    hostOllamaError: chat.hostError,
    sidecarPublish: OLLAMA_SIDECAR_PUBLISH,
    sidecarDns: OLLAMA_SIDECAR_DNS,
  }
})
