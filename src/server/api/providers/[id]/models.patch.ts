import { setOllamaModelChatEnabled } from '../../../utils/providers'
import { listProviderModels, requireProviderId } from '../../../utils/providersView'

export default defineEventHandler(async (event) => {
  const id = requireProviderId(event)
  const body = await readBody<{ name?: string; enabled?: boolean }>(event)
  if (typeof body?.name !== 'string' || typeof body?.enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'name and enabled required' })
  }
  const disabledModels = setOllamaModelChatEnabled(id, body.name, body.enabled)
  const listed = await listProviderModels(id)
  return { ...listed, disabledModels }
})
