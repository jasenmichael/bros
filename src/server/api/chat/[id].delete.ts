import { deleteConversation } from '../../utils/chat'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  deleteConversation(id)
  return { ok: true }
})
