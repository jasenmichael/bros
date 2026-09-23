import { runAgentResearch } from '../../../utils/agentRun'
import { decodeTrace, encodeTrace, withSourceNote } from '../../../utils/agentLoop'
import { FirecrawlDownError } from '../../../utils/firecrawl'
import {
  addMessage,
  assertChatProviderEnabled,
  beginConversationStream,
  endConversationStream,
  getAgentConversation,
  isCurrentConversationStream,
  maybeAutoTitle,
  resolveConversationModel,
} from '../../../utils/chat'

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ content?: string; modelId?: string }>(event)
  if (!body?.content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const convo = getAgentConversation(id)
  if (!convo) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const modelId = resolveConversationModel(id, body.modelId) || convo.modelId
  assertChatProviderEnabled(modelId)

  const job = beginConversationStream(id)
  const onClose = () => {
    if (isCurrentConversationStream(id, job.generation)) job.abort.abort()
  }
  event.node.req.on('close', onClose)

  addMessage(id, 'user', body.content.trim())
  const history = getAgentConversation(id)!.messages.map((m) => ({
    role: m.role,
    content: m.role === 'assistant' ? withSourceNote(m.content, decodeTrace(m.traceJson)) : m.content,
  }))

  setResponseHeader(event, 'content-type', 'text/event-stream; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-cache')

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (name: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(name, data)))
      }
      const started = Date.now()
      const stale = () => job.signal.aborted || !isCurrentConversationStream(id, job.generation)
      try {
        const result = await runAgentResearch({
          modelId,
          history,
          signal: job.signal,
          onStatus: (status) => send('status', status),
          onToken: (text) => send('token', { text }),
        })
        if (stale()) {
          controller.close()
          return
        }
        const durationMs = Date.now() - started
        const stats = {
          durationMs,
          promptTokens: result.usage.promptTokens ?? null,
          completionTokens: result.usage.completionTokens ?? null,
        }
        addMessage(id, 'assistant', result.text, modelId, stats, encodeTrace(result.trace))
        if (result.text.trim()) {
          try {
            await maybeAutoTitle(id)
          } catch {
            // Title failure must not break the answer.
          }
        }
        send('sources', { sources: result.trace.sources })
        send('stats', stats)
        controller.close()
      } catch (err) {
        if (stale() || (err instanceof Error && err.name === 'AbortError')) {
          controller.close()
          return
        }
        const message = err instanceof FirecrawlDownError
          ? err.message
          : (err instanceof Error ? err.message : String(err))
        send('error', { message })
        controller.close()
      } finally {
        event.node.req.off('close', onClose)
        endConversationStream(id, job.generation)
      }
    },
  })

  return sendStream(event, stream)
})
