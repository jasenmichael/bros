import { abortConversationStream, getChatConversation, truncateConversationMessages } from '../../../utils/chat'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ fromMessageId?: string; fromIndex?: number }>(event)
  if (!body?.fromMessageId && (body?.fromIndex == null || !Number.isFinite(body.fromIndex))) {
    throw createError({ statusCode: 400, statusMessage: 'fromMessageId or fromIndex required' })
  }
  if (!getChatConversation(id)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  abortConversationStream(id)
  const next = truncateConversationMessages(id, {
    fromMessageId: body.fromMessageId,
    fromIndex: body.fromIndex,
  })
  if (!next) throw createError({ statusCode: 400, statusMessage: 'user turn not found' })
  return next
})
