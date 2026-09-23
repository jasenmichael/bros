import { deleteConversation, getAgentConversation } from '../../utils/chat'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  if (!getAgentConversation(id)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  deleteConversation(id)
  return { ok: true }
})
