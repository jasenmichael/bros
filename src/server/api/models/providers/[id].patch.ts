import { setOllamaModelChatEnabled, setProviderEnabled } from '../../../utils/providers'
import { sendMoved } from '../../../utils/apiRedirect'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ enabled?: boolean; model?: string; modelEnabled?: boolean }>(event)
  if (typeof body?.modelEnabled === 'boolean' && typeof body?.model === 'string') {
    const disabledModels = setOllamaModelChatEnabled(id, body.model, body.modelEnabled)
    return { disabledModels }
  }
  if (typeof body?.enabled !== 'boolean') {
    return sendMoved(event, `/api/providers/${id}`, 308)
  }
  return await setProviderEnabled(id, body.enabled)
})
