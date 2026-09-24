import { createError } from 'h3'
import { toolSchemas, type AgentCall, type AgentMsg, type ToolRound } from './agentLoop'
import { mergeUsage, usageFromAnthropicEvent, usageFromOllamaObject, usageFromOpenAIObject, type ChatUsage } from './chatStats'
import { getProvider, getProviderSecret, isChatSelectionEnabled, ollamaBaseUrlFor } from './providers'
import { getProviderPreset } from './providerPresets'

export function shortProviderError(status: number, body: string, model: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    parsed = null
  }
  const root = Array.isArray(parsed) ? parsed[0] : parsed
  const err = root && typeof root === 'object' && 'error' in root
    ? (root as { error?: unknown }).error
    : null
  const rec = err && typeof err === 'object' ? err as Record<string, unknown> : null
  const code = rec?.code
  const quota = status === 429 || code === 429 || rec?.status === 'RESOURCE_EXHAUSTED'
  if (quota) {
    let limit = ''
    let retry = ''
    const details = Array.isArray(rec?.details) ? rec.details : []
    for (const detail of details) {
      if (!detail || typeof detail !== 'object') continue
      const row = detail as Record<string, unknown>
      if (typeof row.retryDelay === 'string') retry = row.retryDelay
      const violations = Array.isArray(row.violations) ? row.violations : []
      for (const violation of violations) {
        if (!violation || typeof violation !== 'object') continue
        const value = (violation as { quotaValue?: unknown }).quotaValue
        if (typeof value === 'string' || typeof value === 'number') limit = String(value)
      }
    }
    const name = model || 'this model'
    const cap = limit ? ` (${limit} requests per day)` : ''
    const wait = retry ? ` Retry in ${retry}.` : ''
    return `Gemini quota exceeded for ${name}${cap}.${wait}`
  }
  if (status === 401 || status === 403) return 'The model provider rejected the API key.'
  return `The model provider returned ${status}.`
}

function providerFailure(status: number, body: string, model: string) {
  const message = shortProviderError(status, body, model)
  return createError({ statusCode: 502, message, statusMessage: message })
}

function parseModelId(modelId: string) {
  const idx = modelId.indexOf('/')
  if (idx === -1) return { provider: 'ollama', model: modelId }
  return { provider: modelId.slice(0, idx), model: modelId.slice(idx + 1) }
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => {
    if (typeof part === 'string') return part
    if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') return part.text
    return ''
  }).join('')
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
        tool_calls: m.toolCalls.map((call) => call.raw ?? ({
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
        tool_calls: m.toolCalls.map((call) => call.raw ?? ({
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
    const rec = row as {
      id?: unknown
      name?: unknown
      arguments?: unknown
      function?: { name?: unknown; arguments?: unknown }
    }
    const name = typeof rec.function?.name === 'string'
      ? rec.function.name
      : (typeof rec.name === 'string' ? rec.name : '')
    if (!name) return
    const id = typeof rec.id === 'string' && rec.id ? rec.id : `${idPrefix}_${index}`
    calls.push({ id, name, args: parseArgs(rec.function?.arguments ?? rec.arguments), raw: row })
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

export type ProviderToolSchema = ReturnType<typeof toolSchemas>[number]

export function toAnthropicMessages(messages: AgentMsg[]) {
  const out: Array<{ role: 'user' | 'assistant'; content: unknown }> = []
  for (const message of messages) {
    if (message.role === 'system') continue
    if (message.role === 'assistant' && message.toolCalls?.length) {
      const blocks: unknown[] = []
      if (message.content) blocks.push({ type: 'text', text: message.content })
      for (const call of message.toolCalls) {
        blocks.push(call.raw ?? { type: 'tool_use', id: call.id, name: call.name, input: call.args })
      }
      out.push({ role: 'assistant', content: blocks })
      continue
    }
    if (message.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }
      const prev = out[out.length - 1]
      if (prev?.role === 'user' && Array.isArray(prev.content)) prev.content.push(block)
      else out.push({ role: 'user', content: [block] })
      continue
    }
    out.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    })
  }
  return out
}

function anthropicTools(tools: ProviderToolSchema[]) {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }))
}

export async function completeProviderTools(opts: {
  modelId: string
  messages: AgentMsg[]
  tools: ProviderToolSchema[]
  signal?: AbortSignal
}): Promise<ToolRound> {
  const { provider, model, row } = providerRow(opts.modelId)
  if (!row) throw createError({ statusCode: 400, statusMessage: `Unknown provider ${provider}` })

  if (row.kind === 'ollama') {
    const base = await ollamaBaseUrlFor(provider)
    const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: toOllamaMessages(opts.messages),
        tools: opts.tools,
      }),
      signal: opts.signal,
    })
    if (res.status === 400 || res.status === 422) {
      await res.text()
      return { type: 'unsupported' }
    }
    if (!res.ok) throw providerFailure(res.status, await res.text(), model)
    const json = await res.json() as { message?: { content?: string; tool_calls?: unknown } }
    const calls = parseToolCalls(json.message?.tool_calls, 'ollama')
    const usage = usageFromOllamaObject(json)
    const text = messageText(json.message?.content)
    if (calls.length) return { type: 'tools', calls, text, usage }
    return { type: 'text', text, usage }
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
        tools: opts.tools,
      }),
      signal: opts.signal,
    })
    if (res.status === 400 || res.status === 422) {
      await res.text()
      return { type: 'unsupported' }
    }
    if (!res.ok) throw providerFailure(res.status, await res.text(), model)
    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: unknown } }>
    }
    const message = json.choices?.[0]?.message
    const calls = parseToolCalls(message?.tool_calls, 'openai')
    const usage = usageFromOpenAIObject(json)
    const text = messageText(message?.content)
    if (calls.length) return { type: 'tools', calls, text, usage }
    return { type: 'text', text, usage }
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
        stream: false,
        ...(system ? { system } : {}),
        tools: anthropicTools(opts.tools),
        messages: toAnthropicMessages(opts.messages),
      }),
      signal: opts.signal,
    })
    if (res.status === 400 || res.status === 422) {
      await res.text()
      return { type: 'unsupported' }
    }
    if (!res.ok) throw providerFailure(res.status, await res.text(), model)
    const json = await res.json() as {
      content?: Array<{ type?: string; text?: string; id?: string; name?: string; input?: unknown }>
    }
    const blocks = json.content || []
    const calls: AgentCall[] = []
    blocks.forEach((block, index) => {
      if (block.type !== 'tool_use' || typeof block.name !== 'string' || !block.name) return
      const id = typeof block.id === 'string' && block.id ? block.id : `anthropic_${index}`
      const args = block.input && typeof block.input === 'object' && !Array.isArray(block.input)
        ? block.input as Record<string, unknown>
        : {}
      calls.push({ id, name: block.name, args, raw: block })
    })
    const usage = usageFromAnthropicEvent(json)
    const text = blocks.filter((block) => block.type === 'text').map((block) => block.text || '').join('')
    if (calls.length) return { type: 'tools', calls, text, usage }
    return { type: 'text', text, usage }
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
    if (!res.ok) throw providerFailure(res.status, await res.text(), model)
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
    if (!res.ok) throw providerFailure(res.status, await res.text(), model)
    await readTextStream(res, (line) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) return
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: unknown; reasoning_content?: unknown }
            message?: { content?: unknown }
          }>
        }
        const choice = json.choices?.[0]
        const token = messageText(choice?.delta?.content)
          || messageText(choice?.delta?.reasoning_content)
          || messageText(choice?.message?.content)
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
        messages: toAnthropicMessages(opts.messages),
      }),
      signal: opts.signal,
    })
    if (!res.ok) throw providerFailure(res.status, await res.text(), model)
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
