import {
  addMessage,
  assertChatProviderEnabled,
  beginConversationStream,
  endConversationStream,
  getChatConversation,
  isCurrentConversationStream,
  maybeAutoTitle,
  resolveConversationModel,
  streamChat,
} from '../../../utils/chat/chat'
import { STREAM_STATS_MARK } from '../../../utils/chat/chatStats'
import { applyChatSettings, chatSettingsFromBody } from '../../../utils/chat/chatSettings'
import { withPersona } from '../../../utils/skills'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{
    content?: string
    modelId?: string
    chatPrepend?: string
    chatAssistantDescription?: string
  }>(event)
  if (!body?.content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const convo = getChatConversation(id)
  if (!convo) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const requested = resolveConversationModel(id, body.modelId) || convo.modelId
  if (!requested || requested === 'gateway' || !requested.includes('/')) {
    throw createError({ statusCode: 400, statusMessage: 'provider and model required' })
  }
  assertChatProviderEnabled(requested)
  const modelId = requested

  const job = beginConversationStream(id)
  const onClose = () => {
    if (isCurrentConversationStream(id, job.generation)) job.abort.abort()
  }
  event.node.req.on('close', onClose)

  addMessage(id, 'user', body.content.trim())
  const history = getChatConversation(id)!.messages.map((m) => ({ role: m.role, content: m.content }))

  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-cache')

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let full = ''
      const started = Date.now()
      const stale = () => job.signal.aborted || !isCurrentConversationStream(id, job.generation)
      try {
        const usage = await streamChat({
          modelId,
          history: withPersona(applyChatSettings(history, chatSettingsFromBody(body))),
          chat: { prepend: '', assistantDescription: '' },
          signal: job.signal,
          onToken: (t) => {
            full += t
            controller.enqueue(encoder.encode(t))
          },
        })
        if (stale()) {
          controller.close()
          return
        }
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
        if (stale()) {
          controller.close()
          return
        }
        const msg = err instanceof Error ? err.message : String(err)
        controller.enqueue(encoder.encode(`\n[error] ${msg}`))
        controller.close()
      } finally {
        event.node.req.off('close', onClose)
        endConversationStream(id, job.generation)
      }
    },
  })

  return sendStream(event, stream)
})
