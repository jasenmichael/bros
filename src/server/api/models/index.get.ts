import {
  deleteOllamaModel,
  deleteProvider,
  ensureDefaultProviders,
  listOllamaModels,
  listProviders,
  ollamaBaseUrlFromProvider,
  pullOllamaModel,
  upsertProvider,
} from '../../utils/providers'

export default defineEventHandler(async () => {
  ensureDefaultProviders()
  const providers = listProviders()
  let ollamaModels: Awaited<ReturnType<typeof listOllamaModels>> = []
  let ollamaError: string | null = null
  try {
    ollamaModels = await listOllamaModels(ollamaBaseUrlFromProvider())
  } catch (err) {
    ollamaError = err instanceof Error ? err.message : String(err)
  }
  return { providers, ollamaModels, ollamaError, ollamaBaseUrl: ollamaBaseUrlFromProvider() }
})
