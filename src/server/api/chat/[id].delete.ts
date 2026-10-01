import { deleteConversation, getConversation } from '../../utils/chat/chat'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  if (getConversation(id)?.kind === 'agent') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  deleteConversation(id)
  return { ok: true }
})
