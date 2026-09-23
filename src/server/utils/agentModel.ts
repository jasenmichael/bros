import { createError } from 'h3'
import { RESEARCH_TOOLS, type AgentCall, type AgentMsg, type ToolRound } from './agentLoop'
import { mergeUsage, usageFromAnthropicEvent, usageFromOllamaObject, usageFromOpenAIObject, type ChatUsage } from './chatStats'
import { getProvider, getProviderSecret, isChatSelectionEnabled, ollamaBaseUrlFor } from './providers'
import { getProviderPreset } from './providerPresets'

function parseModelId(modelId: string) {
  const idx = modelId.indexOf('/')
  if (idx === -1) return { provider: 'ollama', model: modelId }
  return { provider: modelId.slice(0, idx), model: modelId.slice(idx + 1) }
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    // Model sent non-JSON arguments.
  }
  return {}
}

export function toOllamaMessages(messages: AgentMsg[]) {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || '',
        tool_calls: m.toolCalls.map((call) => ({
          function: { name: call.name, arguments: call.args },
        })),
      }
    }
    if (m.role === 'tool') return { role: 'tool', content: m.content, tool_name: m.name }
    return { role: m.role, content: m.content }
  })
}

export function toOpenAIMessages(messages: AgentMsg[]) {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.args) },
        })),
      }
    }
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
    return { role: m.role, content: m.content }
  })
}

export function parseToolCalls(raw: unknown, idPrefix: string): AgentCall[] {
  if (!Array.isArray(raw)) return []
  const calls: AgentCall[] = []
  raw.forEach((row, index) => {
    if (!row || typeof row !== 'object') return
    const rec = row as { id?: unknown; function?: { name?: unknown; arguments?: unknown } }
    const name = typeof rec.function?.name === 'string' ? rec.function.name : ''
    if (!name) return
    const id = typeof rec.id === 'string' && rec.id ? rec.id : `${idPrefix}_${index}`
    calls.push({ id, name, args: parseArgs(rec.function?.arguments) })
  })
  return calls
}

function providerRow(modelId: string) {
  const { provider, model } = parseModelId(modelId)
  const row = getProvider(provider)
  if (row && !isChatSelectionEnabled(row)) {
    throw createError({ statusCode: 400, statusMessage: `${row.name} is disabled for chat` })
  }
  return { provider, model, row }
}

async function readTextStream(
  res: Response,
  onLine: (line: string) => void,
) {
  if (!res.body) throw createError({ statusCode: 502, statusMessage: 'empty model stream' })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) onLine(line)
  }
  if (buf) onLine(buf)
}

export async function completeProviderTools(opts: {
  modelId: string
  messages: AgentMsg[]
  signal?: AbortSignal
}): Promise<ToolRound> {
  const { provider, model, row } = providerRow(opts.modelId)
  if (!row) throw createError({ statusCode: 400, statusMessage: `Unknown provider ${provider}` })
  if (row.kind === 'anthropic') return { type: 'unsupported' }

  if (row.kind === 'ollama') {
    const base = await ollamaBaseUrlFor(provider)
    const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: toOllamaMessages(opts.messages),
        tools: RESEARCH_TOOLS,
      }),
      signal: opts.signal,
    })
    if (res.status === 400 || res.status === 422) return { type: 'unsupported' }
    if (!res.ok) throw createError({ statusCode: 502, statusMessage: await res.text() })
    const json = await res.json() as { message?: { content?: string; tool_calls?: unknown } }
    const calls = parseToolCalls(json.message?.tool_calls, 'ollama')
    const usage = usageFromOllamaObject(json)
    if (calls.length) return { type: 'tools', calls, usage }
    return { type: 'text', text: json.message?.content || '', usage }
  }

  if (row.kind === 'openai') {
    const secret = getProviderSecret(provider)
    if (!secret?.row?.enabled) throw createError({ statusCode: 400, statusMessage: `Provider ${provider} not configured` })
    const base = (secret.row.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
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
        stream: false,
        messages: toOpenAIMessages(opts.messages),
        tools: RESEARCH_TOOLS,
      }),
      signal: opts.signal,
    })
    if (res.status === 400 || res.status === 422) return { type: 'unsupported' }
    if (!res.ok) throw createError({ statusCode: 502, statusMessage: await res.text() })
    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: unknown } }>
    }
    const message = json.choices?.[0]?.message
    const calls = parseToolCalls(message?.tool_calls, 'openai')
    const usage = usageFromOpenAIObject(json)
    if (calls.length) return { type: 'tools', calls, usage }
    return { type: 'text', text: message?.content || '', usage }
  }

  throw createError({ statusCode: 400, statusMessage: `Unknown provider ${provider}` })
}

export async function streamProviderAnswer(opts: {
  modelId: string
  messages: AgentMsg[]
  onToken: (token: string) => void
  signal?: AbortSignal
}): Promise<ChatUsage> {
  const { provider, model, row } = providerRow(opts.modelId)
  if (!row) throw createError({ statusCode: 400, statusMessage: `Unknown provider ${provider}` })
  const usage: ChatUsage = {}

  if (row.kind === 'ollama') {
    const base = await ollamaBaseUrlFor(provider)
    const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        messages: toOllamaMessages(opts.messages),
      }),
      signal: opts.signal,
    })
    if (!res.ok) throw createError({ statusCode: 502, statusMessage: await res.text() })
    await readTextStream(res, (line) => {
      if (!line.trim()) return
      try {
        const json = JSON.parse(line) as { message?: { content?: string } }
        const token = json.message?.content || ''
        if (token) opts.onToken(token)
        mergeUsage(usage, usageFromOllamaObject(json))
      } catch {
        // ignore partial lines
      }
    })
    return usage
  }

  if (row.kind === 'openai') {
    const secret = getProviderSecret(provider)
    if (!secret?.row?.enabled) throw createError({ statusCode: 400, statusMessage: `Provider ${provider} not configured` })
    const base = (secret.row.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
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
        messages: toOpenAIMessages(opts.messages),
      }),
      signal: opts.signal,
    })
    if (!res.ok) throw createError({ statusCode: 502, statusMessage: await res.text() })
    await readTextStream(res, (line) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) return
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }> }
        const delta = json.choices?.[0]?.delta
        const token = delta?.content || delta?.reasoning_content || ''
        if (token) opts.onToken(token)
        mergeUsage(usage, usageFromOpenAIObject(json))
      } catch {
        // ignore
      }
    })
    return usage
  }

  if (row.kind === 'anthropic') {
    const secret = getProviderSecret(provider)
    if (!secret?.row?.enabled) throw createError({ statusCode: 400, statusMessage: `Provider ${provider} not configured` })
    const base = (secret.row.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')
    const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
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
        ...(system ? { system } : {}),
        messages: opts.messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
      signal: opts.signal,
    })
    if (!res.ok) throw createError({ statusCode: 502, statusMessage: await res.text() })
    await readTextStream(res, (line) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) return
      try {
        const json = JSON.parse(trimmed.slice(5).trim()) as { type?: string; delta?: { text?: string } }
        if (json.type === 'content_block_delta') {
          const token = json.delta?.text || ''
          if (token) opts.onToken(token)
        }
        mergeUsage(usage, usageFromAnthropicEvent(json))
      } catch {
        // ignore
      }
    })
    return usage
  }

  throw createError({ statusCode: 400, statusMessage: `Unknown provider ${provider}` })
}
