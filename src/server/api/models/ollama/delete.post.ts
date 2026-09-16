import { deleteOllamaModel, ollamaBaseUrlFromProvider } from '../../../utils/providers'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; model?: string }>(event)
  const name = (body?.model || body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'model required' })
  return deleteOllamaModel(ollamaBaseUrlFromProvider(), name)
})
