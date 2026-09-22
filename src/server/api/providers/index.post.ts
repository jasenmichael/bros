import { getProviderPreset, isPopularProvider } from '../../utils/providerPresets'
import { getProvider, isSystemProvider, persistProviderAndSyncChat, type ProviderKind } from '../../utils/providers'
import { assertHostOllamaVisible } from '../../utils/hostOllamaSettings'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    id: string
    name: string
    kind: ProviderKind
    baseUrl?: string | null
    apiKey?: string | null
    enabled?: boolean
    config?: Record<string, unknown>
  }>(event)
  if (!body?.id || !body?.name || !body?.kind) {
    throw createError({ statusCode: 400, statusMessage: 'id, name, kind required' })
  }
  assertHostOllamaVisible(body.id)
  if (body.kind !== 'ollama' && body.kind !== 'openai' && body.kind !== 'anthropic') {
    throw createError({ statusCode: 400, statusMessage: 'kind must be ollama, openai, or anthropic' })
  }
  if (isSystemProvider(body.id)) {
    if (body.kind !== 'ollama') {
      throw createError({ statusCode: 400, statusMessage: 'Built-in Ollama providers cannot change kind' })
    }
  }
  else if (isPopularProvider(body.id)) {
    if (body.kind !== 'openai') {
      throw createError({ statusCode: 400, statusMessage: 'Popular services must stay OpenAI-compatible' })
    }
    const preset = getProviderPreset(body.id)
    return persistProviderAndSyncChat({
      ...body,
      kind: 'openai',
      baseUrl: preset?.baseUrl ?? body.baseUrl,
    })
  }
  else {
    const existing = getProvider(body.id)
    if (existing?.kind === 'anthropic') {
      if (body.kind !== 'anthropic') {
        throw createError({ statusCode: 400, statusMessage: 'Cannot change provider kind' })
      }
    }
    else if (body.kind !== 'openai') {
      throw createError({ statusCode: 400, statusMessage: 'Custom providers must be OpenAI-compatible' })
    }
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(body.id)) {
      throw createError({ statusCode: 400, statusMessage: 'id must be a lowercase slug' })
    }
  }
  return persistProviderAndSyncChat(body)
})
