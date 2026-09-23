import { createConversation } from '../../utils/chat'
import { DEFAULT_AGENT_TITLE } from '../../utils/chatTitle'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ modelId?: string; title?: string }>(event)
  if (!body?.modelId) throw createError({ statusCode: 400, statusMessage: 'modelId required' })
  return createConversation(body.modelId, body.title?.trim() || DEFAULT_AGENT_TITLE, 'agent')
})
