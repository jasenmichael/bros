import { sendMoved } from '../../../utils/apiRedirect'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  return sendMoved(event, `/api/providers/${id}`, 308)
})
