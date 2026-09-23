import { getAgentConversation, resolveConversationModel, updateConversationTitle } from '../../utils/chat'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  if (!getAgentConversation(id)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const body = await readBody<{ modelId?: string; title?: string }>(event)
  const modelId = body?.modelId?.trim()
  const title = body?.title
  if (!modelId && title === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'modelId or title required' })
  }
  if (title !== undefined) {
    const next = title.trim()
    if (!next) throw createError({ statusCode: 400, statusMessage: 'title required' })
    updateConversationTitle(id, next)
  }
  if (modelId) {
    const resolved = resolveConversationModel(id, modelId)
    if (!resolved) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const convo = getAgentConversation(id)
  if (!convo) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return convo
})
