import { desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb, conversations, messages } from './db'
import { getProviderSecret, ollamaBaseUrlFromProvider } from './providers'

export function listConversations() {
  return getDb().select().from(conversations).orderBy(desc(conversations.updatedAt)).all()
}

export function getConversation(id: string) {
  const convo = getDb().select().from(conversations).where(eq(conversations.id, id)).get()
  if (!convo) return null
  const msgs = getDb().select().from(messages).where(eq(messages.conversationId, id)).all()
  return { ...convo, messages: msgs }
}

export function createConversation(modelId: string, title = 'New chat') {
  const id = randomUUID()
  const now = Date.now()
  getDb().insert(conversations).values({
    id,
    title,
    modelId,
    createdAt: now,
    updatedAt: now,
  }).run()
  return getConversation(id)
}

export function addMessage(conversationId: string, role: string, content: string) {
  const id = randomUUID()
  getDb().insert(messages).values({
    id,
    conversationId,
    role,
    content,
    createdAt: Date.now(),
  }).run()
  getDb().update(conversations).set({ updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
  return id
}

export function deleteConversation(id: string) {
  getDb().delete(messages).where(eq(messages.conversationId, id)).run()
  getDb().delete(conversations).where(eq(conversations.id, id)).run()
}

function parseModelId(modelId: string) {
  const idx = modelId.indexOf('/')
  if (idx === -1) return { provider: 'ollama', model: modelId }
  return { provider: modelId.slice(0, idx), model: modelId.slice(idx + 1) }
}

export async function streamChat(opts: {
  modelId: string
  history: Array<{ role: string; content: string }>
  onToken: (t: string) => void
}) {
  const { provider, model } = parseModelId(opts.modelId)

  if (provider === 'ollama') {
    const base = ollamaBaseUrlFromProvider()
    const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        messages: opts.history.map((m) => ({ role: m.role, content: m.content })),
      }),
    })
    if (!res.ok || !res.body) throw createError({ statusCode: 502, statusMessage: await res.text() })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const json = JSON.parse(line)
          const token = json.message?.content || ''
          if (token) opts.onToken(token)
        } catch {
          // ignore
        }
      }
    }
    return
  }

  if (provider === 'openai' || provider === 'anthropic') {
    const secret = getProviderSecret(provider)
    if (!secret?.row?.enabled) throw createError({ statusCode: 400, statusMessage: `Provider ${provider} not configured` })
    const base = (secret.row.baseUrl || (provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com')).replace(/\/$/, '')

    if (provider === 'openai') {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret.apiKey || ''}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: opts.history,
        }),
      })
      if (!res.ok || !res.body) throw createError({ statusCode: 502, statusMessage: await res.text() })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n')
        buf = parts.pop() || ''
        for (const line of parts) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const token = json.choices?.[0]?.delta?.content || ''
            if (token) opts.onToken(token)
          } catch {
            // ignore
          }
        }
      }
      return
    }

    // anthropic messages stream
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': secret.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        stream: true,
        messages: opts.history.filter((m) => m.role !== 'system').map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      }),
    })
    if (!res.ok || !res.body) throw createError({ statusCode: 502, statusMessage: await res.text() })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n')
      buf = parts.pop() || ''
      for (const line of parts) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        try {
          const json = JSON.parse(data)
          if (json.type === 'content_block_delta') {
            const token = json.delta?.text || ''
            if (token) opts.onToken(token)
          }
        } catch {
          // ignore
        }
      }
    }
    return
  }

  throw createError({ statusCode: 400, statusMessage: `Unknown provider ${provider}` })
}
