import { createError } from 'h3'
import { desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb, conversations, messages } from './db'
import { INTERNAL_BROS_MODEL } from './internalBrosModel'
import { getProvider, getProviderPreset, getProviderSecret, isChatSelectionEnabled, ollamaBaseUrlFor, OLLAMA_SIDECAR_ID } from './providers'
import {
  DEFAULT_CHAT_TITLE,
  fallbackTitleFromPrompt,
  labelRequestContent,
  sanitizeGeneratedTitle,
  shouldAutoTitle,
} from './chatTitle'
import {
  mergeUsage,
  usageFromAnthropicEvent,
  usageFromOllamaObject,
  usageFromOpenAIObject,
  type ChatUsage,
} from './chatStats'

export function listConversations() {
  return getDb().select().from(conversations).orderBy(desc(conversations.updatedAt)).all()
}

export function getConversation(id: string) {
  const convo = getDb().select().from(conversations).where(eq(conversations.id, id)).get()
  if (!convo) return null
  const msgs = getDb().select().from(messages).where(eq(messages.conversationId, id)).all()
  return { ...convo, messages: msgs }
}

export function createConversation(modelId: string, title = DEFAULT_CHAT_TITLE) {
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

export type MessageStats = {
  durationMs?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
}

export function addMessage(
  conversationId: string,
  role: string,
  content: string,
  modelId?: string,
  stats?: MessageStats,
) {
  const id = randomUUID()
  getDb().insert(messages).values({
    id,
    conversationId,
    role,
    content,
    modelId: modelId || null,
    durationMs: stats?.durationMs ?? null,
    promptTokens: stats?.promptTokens ?? null,
    completionTokens: stats?.completionTokens ?? null,
    createdAt: Date.now(),
  }).run()
  getDb().update(conversations).set({ updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
  return id
}

export function deleteConversation(id: string) {
  getDb().delete(messages).where(eq(messages.conversationId, id)).run()
  getDb().delete(conversations).where(eq(conversations.id, id)).run()
}

export function updateConversationTitle(id: string, title: string) {
  const next = title.trim()
  if (!next) return getConversation(id)
  getDb().update(conversations).set({
    title: next,
    updatedAt: Date.now(),
  }).where(eq(conversations.id, id)).run()
  return getConversation(id)
}

const TITLE_GENERATE_MS = 30_000

/** Sidecar specialist `bros` only. Ignores conversation modelId. */
export async function generateChatTitle(_modelId: string, userPrompt: string): Promise<string> {
  const base = await ollamaBaseUrlFor(OLLAMA_SIDECAR_ID)
  const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: INTERNAL_BROS_MODEL,
      stream: false,
      messages: [{ role: 'user', content: labelRequestContent(userPrompt) }],
    }),
    signal: AbortSignal.timeout(TITLE_GENERATE_MS),
  })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json() as { message?: { content?: string } }
  return String(json.message?.content || '')
}

/** First successful assistant reply only. Sidecar bros. Failure keeps New chat / first-line fallback. */
export async function maybeAutoTitle(
  conversationId: string,
  generate: (modelId: string, userPrompt: string) => Promise<string> = generateChatTitle,
) {
  const convo = getConversation(conversationId)
  if (!convo) return null
  const assistantCount = convo.messages.filter((m) => m.role === 'assistant').length
  if (!shouldAutoTitle(convo.title, assistantCount)) return convo.title
  const firstUser = convo.messages.find((m) => m.role === 'user')?.content || ''
  const fallback = fallbackTitleFromPrompt(firstUser)
  try {
    const raw = await generate(convo.modelId, firstUser)
    const title = sanitizeGeneratedTitle(raw, fallback)
    updateConversationTitle(conversationId, title)
    return title
  } catch (err) {
    console.warn('chat title generate failed', err instanceof Error ? err.message : err)
    updateConversationTitle(conversationId, fallback)
    return fallback
  }
}

/** Persist requested modelId when present; return modelId stream / PATCH must use. */
export function resolveConversationModel(id: string, requested?: string): string | null {
  const convo = getConversation(id)
  if (!convo) return null
  const next = requested?.trim()
  if (!next) return convo.modelId
  if (next !== convo.modelId) {
    getDb().update(conversations).set({
      modelId: next,
      updatedAt: Date.now(),
    }).where(eq(conversations.id, id)).run()
  }
  return next
}

function parseModelId(modelId: string) {
  const idx = modelId.indexOf('/')
  if (idx === -1) return { provider: 'ollama', model: modelId }
  return { provider: modelId.slice(0, idx), model: modelId.slice(idx + 1) }
}

export function assertChatProviderEnabled(modelId: string) {
  const { provider } = parseModelId(modelId)
  const row = getProvider(provider)
  if (row && !isChatSelectionEnabled(row)) {
    throw createError({ statusCode: 400, statusMessage: `${row.name} is disabled for chat` })
  }
}

export async function streamChat(opts: {
  modelId: string
  history: Array<{ role: string; content: string }>
  onToken: (t: string) => void
}): Promise<ChatUsage> {
  const { provider, model } = parseModelId(opts.modelId)
  const usage: ChatUsage = {}
  const row = getProvider(provider)
  if (row && !isChatSelectionEnabled(row)) {
    throw createError({ statusCode: 400, statusMessage: `${row.name} is disabled for chat` })
  }

  if (row?.kind === 'ollama') {
    const base = await ollamaBaseUrlFor(provider)
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
    const takeLine = (line: string) => {
      if (!line.trim()) return
      try {
        const json = JSON.parse(line)
        const token = json.message?.content || ''
        if (token) opts.onToken(token)
        mergeUsage(usage, usageFromOllamaObject(json))
      } catch {
        // ignore
      }
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) takeLine(line)
    }
    takeLine(buf)
    return usage
  }

  if (row?.kind === 'openai' || row?.kind === 'anthropic') {
    const secret = getProviderSecret(provider)
    if (!secret?.row?.enabled) throw createError({ statusCode: 400, statusMessage: `Provider ${provider} not configured` })
    const base = (secret.row.baseUrl || (row.kind === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com')).replace(/\/$/, '')

    if (row.kind === 'openai') {
      const extraHeaders = getProviderPreset(provider)?.headers || {}
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret.apiKey || ''}`,
          ...extraHeaders,
        },
        body: JSON.stringify({
          model,
          stream: true,
          stream_options: { include_usage: true },
          messages: opts.history,
        }),
      })
      if (!res.ok || !res.body) throw createError({ statusCode: 502, statusMessage: await res.text() })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      const takeLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) return
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') return
        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta
          const token = delta?.content || delta?.reasoning_content || ''
          if (token) opts.onToken(token)
          mergeUsage(usage, usageFromOpenAIObject(json))
        } catch {
          // ignore
        }
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n')
        buf = parts.pop() || ''
        for (const line of parts) takeLine(line)
      }
      takeLine(buf)
      return usage
    }

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
    const takeLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) return
      const data = trimmed.slice(5).trim()
      try {
        const json = JSON.parse(data)
        if (json.type === 'content_block_delta') {
          const token = json.delta?.text || ''
          if (token) opts.onToken(token)
        }
        mergeUsage(usage, usageFromAnthropicEvent(json))
      } catch {
        // ignore
      }
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n')
      buf = parts.pop() || ''
      for (const line of parts) takeLine(line)
    }
    takeLine(buf)
    return usage
  }

  throw createError({ statusCode: 400, statusMessage: `Unknown provider ${provider}` })
}
