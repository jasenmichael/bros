import { addMessage, getConversation, maybeAutoTitle, resolveConversationModel, streamChat } from '../../../utils/chat'
import { STREAM_STATS_MARK } from '../../../utils/chatStats'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ content?: string; modelId?: string }>(event)
  if (!body?.content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const convo = getConversation(id)
  if (!convo) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const modelId = resolveConversationModel(id, body.modelId) || convo.modelId

  addMessage(id, 'user', body.content.trim())
  const history = getConversation(id)!.messages.map((m) => ({ role: m.role, content: m.content }))

  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-cache')

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let full = ''
      const started = Date.now()
      try {
        const usage = await streamChat({
          modelId,
          history,
          onToken: (t) => {
            full += t
            controller.enqueue(encoder.encode(t))
          },
        })
        const durationMs = Date.now() - started
        const stats = {
          durationMs,
          promptTokens: usage.promptTokens ?? null,
          completionTokens: usage.completionTokens ?? null,
        }
        addMessage(id, 'assistant', full, modelId, stats)
        if (full.trim()) {
          try {
            await maybeAutoTitle(id)
          } catch {
            // Title failure must not break the chat.
          }
        }
        controller.enqueue(encoder.encode(`${STREAM_STATS_MARK}${JSON.stringify(stats)}`))
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        controller.enqueue(encoder.encode(`\n[error] ${msg}`))
        controller.close()
      }
    },
  })

  return sendStream(event, stream)
})
