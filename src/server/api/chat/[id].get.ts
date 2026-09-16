import { getConversation } from '../../utils/chat'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const convo = getConversation(id)
  if (!convo) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return convo
})
