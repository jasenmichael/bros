import { addMessage, getConversation, streamChat } from '../../../utils/chat'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ content?: string }>(event)
  if (!body?.content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const convo = getConversation(id)
  if (!convo) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  addMessage(id, 'user', body.content.trim())
  const history = getConversation(id)!.messages.map((m) => ({ role: m.role, content: m.content }))

  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-cache')

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let full = ''
      try {
        await streamChat({
          modelId: convo.modelId,
          history,
          onToken: (t) => {
            full += t
            controller.enqueue(encoder.encode(t))
          },
        })
        addMessage(id, 'assistant', full)
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
