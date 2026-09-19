import { setProviderEnabled } from '../../../utils/providers'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ enabled?: boolean }>(event)
  if (typeof body?.enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'enabled boolean required' })
  }
  return setProviderEnabled(id, body.enabled)
})
