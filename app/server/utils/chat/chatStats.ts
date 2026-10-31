export type ChatUsage = {
  promptTokens?: number
  completionTokens?: number
}

/** Trailer after streamed tokens so the client can persist the same stats. */
export const STREAM_STATS_MARK = '\x1eBROS_STATS\x1e'

export function asTokenCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.round(value)
}

export function usageFromOllamaObject(json: unknown): ChatUsage {
  if (!json || typeof json !== 'object') return {}
  const row = json as Record<string, unknown>
  const usage: ChatUsage = {}
  const prompt = asTokenCount(row.prompt_eval_count)
  const completion = asTokenCount(row.eval_count)
  if (prompt !== undefined) usage.promptTokens = prompt
  if (completion !== undefined) usage.completionTokens = completion
  return usage
}

export function usageFromOpenAIObject(json: unknown): ChatUsage {
  if (!json || typeof json !== 'object') return {}
  const usage = (json as { usage?: Record<string, unknown> }).usage
  if (!usage) return {}
  const out: ChatUsage = {}
  const prompt = asTokenCount(usage.prompt_tokens)
  const completion = asTokenCount(usage.completion_tokens)
  if (prompt !== undefined) out.promptTokens = prompt
  if (completion !== undefined) out.completionTokens = completion
  return out
}

export function usageFromAnthropicEvent(json: unknown): ChatUsage {
  if (!json || typeof json !== 'object') return {}
  const row = json as {
    type?: string
    message?: { usage?: Record<string, unknown> }
    usage?: Record<string, unknown>
  }
  const out: ChatUsage = {}
  if (row.type === 'message_start') {
    const prompt = asTokenCount(row.message?.usage?.input_tokens)
    if (prompt !== undefined) out.promptTokens = prompt
  }
  if (row.type === 'message_delta' || row.type === 'message_start') {
    const completion = asTokenCount(row.usage?.output_tokens ?? row.message?.usage?.output_tokens)
    if (completion !== undefined) out.completionTokens = completion
  }
  return out
}

export function mergeUsage(into: ChatUsage, next: ChatUsage): ChatUsage {
  if (next.promptTokens !== undefined) into.promptTokens = next.promptTokens
  if (next.completionTokens !== undefined) into.completionTokens = next.completionTokens
  return into
}

export function ollamaNameFromModelId(modelId: string): string | null {
  const id = modelId.trim()
  if (!id) return null
  if (id.startsWith('ollama-host/')) return id.slice('ollama-host/'.length) || null
  if (id.startsWith('ollama/')) return id.slice('ollama/'.length) || null
  return null
}

export function parseOllamaContextLength(show: unknown): number | null {
  if (!show || typeof show !== 'object') return null
  const rec = show as Record<string, unknown>

  const info = rec.model_info
  if (info && typeof info === 'object') {
    for (const [key, value] of Object.entries(info as Record<string, unknown>)) {
      if (key === 'context_length' || key.endsWith('.context_length')) {
        const n = asTokenCount(value)
        if (n !== undefined && n > 0) return n
      }
    }
  }

  const details = rec.details
  if (details && typeof details === 'object') {
    const n = asTokenCount((details as Record<string, unknown>).context_length)
    if (n !== undefined && n > 0) return n
  }

  if (typeof rec.parameters === 'string') {
    const match = rec.parameters.match(/(?:^|\n)\s*num_ctx\s+(\d+)/)
    if (match) {
      const n = Number(match[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }

  return null
}
