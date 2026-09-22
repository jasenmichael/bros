import { OLLAMA_HOST_ID } from '../../../utils/providers'
import { requireProviderId } from '../../../utils/providersView'
import { scanHostOllamaApi } from '../../../utils/ollamaHost'

export default defineEventHandler((event) => {
  const id = requireProviderId(event)
  if (id !== OLLAMA_HOST_ID) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }
  return scanHostOllamaApi()
})