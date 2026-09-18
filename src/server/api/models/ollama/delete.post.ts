import { refuseInternalBrosModel } from '../../../utils/internalBrosModel'
import { deleteOllamaModel, ollamaBaseUrlFor, OLLAMA_SIDECAR_ID } from '../../../utils/providers'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; model?: string; providerId?: string }>(event)
  const name = (body?.model || body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'model required' })
  refuseInternalBrosModel(name)
  const providerId = body?.providerId || OLLAMA_SIDECAR_ID
  return deleteOllamaModel(await ollamaBaseUrlFor(providerId), name)
})
