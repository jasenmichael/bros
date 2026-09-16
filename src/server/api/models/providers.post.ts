import { upsertProvider } from '../../utils/providers'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    id: string
    name: string
    kind: 'ollama' | 'openai' | 'anthropic'
    baseUrl?: string | null
    apiKey?: string | null
    enabled?: boolean
    config?: Record<string, unknown>
  }>(event)
  if (!body?.id || !body?.name || !body?.kind) {
    throw createError({ statusCode: 400, statusMessage: 'id, name, kind required' })
  }
  return upsertProvider(body)
})
