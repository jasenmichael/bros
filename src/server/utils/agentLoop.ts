import { canonicalUrl, publicHttpUrl, type SearchHit } from './firecrawl'
import { mergeUsage, type ChatUsage } from './chatStats'

export const MAX_TOOL_STEPS = 8

export type AgentCall = {
  id: string
  name: string
  args: Record<string, unknown>
  /** Provider tool-call object, replayed unchanged (Gemini thought_signature lives here). */
  raw?: unknown
}

export type AgentMsg = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: AgentCall[]
  toolCallId?: string
  name?: string
}

export type ToolRound =
  | { type: 'text'; text: string; usage?: ChatUsage }
  | { type: 'tools'; calls: AgentCall[]; text?: string; usage?: ChatUsage }
  | { type: 'unsupported' }

export type AgentSource = { title: string; url: string }

export type AgentTrace = {
  queries: string[]
  sources: AgentSource[]
}

export type AgentStatus = {
  phase: 'searching' | 'reading' | 'answering'
  detail: string
}

export type ToolContext = {
  signal?: AbortSignal
  root: string
  allowedUrls: Set<string>
  trace: AgentTrace
  onStatus?: (status: AgentStatus) => void
  search: (query: string, signal?: AbortSignal) => Promise<SearchHit[]>
  scrape: (url: string, signal?: AbortSignal) => Promise<string>
}

export type AgentTool = {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>
}

export function toolSchemas(tools: AgentTool[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

export type AgentLoopResult = {
  text: string
  trace: AgentTrace
  usage: ChatUsage
  mode: 'tools' | 'answer'
}

export type AgentLoopDeps = {
  completeWithTools: (messages: AgentMsg[], signal?: AbortSignal) => Promise<ToolRound>
  streamAnswer: (messages: AgentMsg[], onToken: (token: string) => void, signal?: AbortSignal) => Promise<ChatUsage>
  tools: AgentTool[]
  search: (query: string, signal?: AbortSignal) => Promise<SearchHit[]>
  scrape: (url: string, signal?: AbortSignal) => Promise<string>
  root: string
  onStatus?: (status: AgentStatus) => void
  onToken: (token: string) => void
  signal?: AbortSignal
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  const err = new Error('aborted')
  err.name = 'AbortError'
  throw err
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`)>\]]+/gi

export function urlsInText(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const raw of text.match(URL_IN_TEXT) || []) {
    const url = publicHttpUrl(raw.replace(/[.,;:!?]+$/, ''))
    const key = url ? canonicalUrl(url) : null
    if (!url || !key || seen.has(key)) continue
    seen.add(key)
    found.push(url)
  }
  return found
}

function seedAllowed(text: string, allowed: Set<string>) {
  for (const url of urlsInText(text)) {
    const key = canonicalUrl(url)
    if (key) allowed.add(key)
  }
}

async function streamFinal(
  messages: AgentMsg[],
  deps: AgentLoopDeps,
  trace: AgentTrace,
  usage: ChatUsage,
  mode: AgentLoopResult['mode'],
): Promise<AgentLoopResult> {
  deps.onStatus?.({ phase: 'answering', detail: '' })
  let text = ''
  const streamed = await deps.streamAnswer(messages, (token) => {
    text += token
    deps.onToken(token)
  }, deps.signal)
  mergeUsage(usage, streamed)
  return { text, trace, usage, mode }
}

export async function runAgentLoop(history: AgentMsg[], deps: AgentLoopDeps): Promise<AgentLoopResult> {
  throwIfAborted(deps.signal)
  const trace: AgentTrace = { queries: [], sources: [] }
  const usage: ChatUsage = {}
  const messages = history.map((m) => ({ ...m }))
  const allowedUrls = new Set<string>()
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || ''
  seedAllowed(lastUser, allowedUrls)
  const ctx: ToolContext = {
    signal: deps.signal,
    root: deps.root,
    allowedUrls,
    trace,
    onStatus: deps.onStatus,
    search: deps.search,
    scrape: deps.scrape,
  }

  let steps = 0
  let usedTools = false
  let round = await deps.completeWithTools(messages, deps.signal)
  if (round.usage) mergeUsage(usage, round.usage)

  while (round.type === 'tools') {
    throwIfAborted(deps.signal)
    const room = MAX_TOOL_STEPS - steps
    if (room <= 0) break
    const calls = round.calls.slice(0, room)
    messages.push({ role: 'assistant', content: round.text || '', toolCalls: calls })
    for (const call of calls) {
      steps += 1
      usedTools = true
      const tool = deps.tools.find((item) => item.name === call.name)
      let content: string
      try {
        content = tool ? await tool.execute(call.args, ctx) : `Unknown tool ${call.name}`
      } catch (err) {
        if (isAbort(err)) throw err
        content = err instanceof Error ? err.message : String(err)
      }
      messages.push({
        role: 'tool',
        content,
        toolCallId: call.id,
        name: call.name,
      })
    }
    if (steps >= MAX_TOOL_STEPS) break
    round = await deps.completeWithTools(messages, deps.signal)
    if (round.usage) mergeUsage(usage, round.usage)
    if (round.type === 'text' && round.text.trim()) {
      deps.onStatus?.({ phase: 'answering', detail: '' })
      deps.onToken(round.text)
      return { text: round.text, trace, usage, mode: 'tools' }
    }
    if (round.type !== 'tools') break
  }

  if (!usedTools && round.type === 'text' && round.text.trim()) {
    deps.onStatus?.({ phase: 'answering', detail: '' })
    deps.onToken(round.text)
    return { text: round.text, trace, usage, mode: 'answer' }
  }

  return streamFinal(messages, deps, trace, usage, usedTools ? 'tools' : 'answer')
}

export function encodeTrace(trace: AgentTrace): string {
  return JSON.stringify({ queries: trace.queries, sources: trace.sources })
}

export function decodeTrace(raw: string | null | undefined): AgentTrace {
  if (!raw) return { queries: [], sources: [] }
  try {
    const json = JSON.parse(raw) as { queries?: unknown; sources?: unknown }
    const queries = Array.isArray(json.queries) ? json.queries.filter((q): q is string => typeof q === 'string') : []
    const sources = Array.isArray(json.sources)
      ? json.sources.flatMap((row) => {
        if (!row || typeof row !== 'object') return []
        const rec = row as { title?: unknown; url?: unknown }
        if (typeof rec.url !== 'string') return []
        return [{ title: typeof rec.title === 'string' ? rec.title : rec.url, url: rec.url }]
      })
      : []
    return { queries, sources }
  } catch {
    return { queries: [], sources: [] }
  }
}

/** Next turn sees the answer plus urls, not the scraped pages. */
export function withSourceNote(content: string, trace: AgentTrace): string {
  if (!trace.sources.length) return content
  const lines = trace.sources.map((s) => `- ${s.title} (${s.url})`).join('\n')
  return `${content}\n\nSources:\n${lines}`
}
