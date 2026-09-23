import {
  canonicalUrl,
  RETRIEVE_SCRAPE_COUNT,
  scrapeAllowed,
  type SearchHit,
} from './firecrawl'
import { mergeUsage, type ChatUsage } from './chatStats'

export const MAX_TOOL_STEPS = 6

export const RESEARCH_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web. Use when the answer needs current pages. Returns titles, urls, and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_scrape',
      description: 'Read one public http(s) page from this turn’s search results as markdown.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL returned by web_search this turn' },
        },
        required: ['url'],
      },
    },
  },
] as const

export type AgentCall = {
  id: string
  name: string
  args: Record<string, unknown>
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
  | { type: 'tools'; calls: AgentCall[]; usage?: ChatUsage }
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

export type AgentLoopResult = {
  text: string
  trace: AgentTrace
  usage: ChatUsage
  mode: 'tools' | 'retrieve'
}

export type AgentLoopDeps = {
  completeWithTools: (messages: AgentMsg[], signal?: AbortSignal) => Promise<ToolRound>
  streamAnswer: (messages: AgentMsg[], onToken: (token: string) => void, signal?: AbortSignal) => Promise<ChatUsage>
  search: (query: string, signal?: AbortSignal) => Promise<SearchHit[]>
  scrape: (url: string, signal?: AbortSignal) => Promise<string>
  onStatus?: (status: AgentStatus) => void
  onToken: (token: string) => void
  signal?: AbortSignal
  /** Prefer this over last user content for fallback search (avoids Chat prepend). */
  retrieveQuery?: string
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  const err = new Error('aborted')
  err.name = 'AbortError'
  throw err
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function rememberHit(trace: AgentTrace, allowed: Set<string>, hit: SearchHit) {
  const key = canonicalUrl(hit.url)
  if (!key) return
  allowed.add(key)
  if (trace.sources.some((s) => canonicalUrl(s.url) === key)) return
  trace.sources.push({ title: hit.title, url: hit.url })
}

function formatHits(hits: SearchHit[]): string {
  if (!hits.length) return 'No results.'
  return hits.map((hit, i) => `${i + 1}. ${hit.title}\n${hit.url}\n${hit.snippet}`.trim()).join('\n\n')
}

async function runSearch(query: string, deps: AgentLoopDeps, trace: AgentTrace, allowed: Set<string>): Promise<string> {
  throwIfAborted(deps.signal)
  deps.onStatus?.({ phase: 'searching', detail: query })
  trace.queries.push(query)
  const hits = await deps.search(query, deps.signal)
  for (const hit of hits) rememberHit(trace, allowed, hit)
  return formatHits(hits)
}

async function runScrape(url: string, deps: AgentLoopDeps, allowed: Set<string>): Promise<string> {
  const gate = scrapeAllowed(url, allowed)
  if (!gate.ok) return `Refused: ${gate.reason}`
  throwIfAborted(deps.signal)
  deps.onStatus?.({ phase: 'reading', detail: hostOf(gate.url) })
  const markdown = await deps.scrape(gate.url, deps.signal)
  return markdown || 'Empty page.'
}

async function executeCall(call: AgentCall, deps: AgentLoopDeps, trace: AgentTrace, allowed: Set<string>): Promise<string> {
  if (call.name === 'web_search') {
    const query = String(call.args.query || '').trim()
    if (!query) return 'query required'
    return runSearch(query, deps, trace, allowed)
  }
  if (call.name === 'web_scrape') {
    const url = String(call.args.url || '').trim()
    if (!url) return 'url required'
    return runScrape(url, deps, allowed)
  }
  return `Unknown tool ${call.name}`
}

function researchPrompt(hits: SearchHit[], pages: Array<{ hit: SearchHit; markdown: string }>): string {
  const blocks = pages.map(({ hit, markdown }) => `# ${hit.title}\n${hit.url}\n\n${markdown || hit.snippet}`)
  const unused = hits.filter((hit) => !pages.some((page) => page.hit.url === hit.url))
  const extra = unused.map((hit) => `- ${hit.title} (${hit.url}) ${hit.snippet}`.trim())
  return [
    'Web pages collected for this question. Answer from them. Cite the urls you use.',
    blocks.join('\n\n'),
    extra.length ? `Other results:\n${extra.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

async function runRetrieve(messages: AgentMsg[], deps: AgentLoopDeps, trace: AgentTrace, usage: ChatUsage): Promise<AgentLoopResult> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || ''
  const query = (deps.retrieveQuery || lastUser).trim()
  const allowed = new Set<string>()
  const hits = query ? await (async () => {
    deps.onStatus?.({ phase: 'searching', detail: query })
    trace.queries.push(query)
    const found = await deps.search(query, deps.signal)
    for (const hit of found) rememberHit(trace, allowed, hit)
    return found
  })() : []
  const pages: Array<{ hit: SearchHit; markdown: string }> = []
  for (const hit of hits.slice(0, RETRIEVE_SCRAPE_COUNT)) {
    throwIfAborted(deps.signal)
    deps.onStatus?.({ phase: 'reading', detail: hostOf(hit.url) })
    try {
      const markdown = await deps.scrape(hit.url, deps.signal)
      pages.push({ hit, markdown })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      pages.push({
        hit,
        markdown: `Error fetching page: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }
  const withResearch: AgentMsg[] = [
    ...messages,
    { role: 'system', content: researchPrompt(hits, pages) },
  ]
  deps.onStatus?.({ phase: 'answering', detail: '' })
  let text = ''
  const streamed = await deps.streamAnswer(withResearch, (token) => {
    text += token
    deps.onToken(token)
  }, deps.signal)
  mergeUsage(usage, streamed)
  return { text, trace, usage, mode: 'retrieve' }
}

export async function runAgentLoop(history: AgentMsg[], deps: AgentLoopDeps): Promise<AgentLoopResult> {
  throwIfAborted(deps.signal)
  const trace: AgentTrace = { queries: [], sources: [] }
  const usage: ChatUsage = {}
  const allowed = new Set<string>()
  const messages = history.map((m) => ({ ...m }))

  let round = await deps.completeWithTools(messages, deps.signal)
  if (round.usage) mergeUsage(usage, round.usage)
  if (round.type === 'unsupported') return runRetrieve(messages, deps, trace, usage)

  let toolSteps = 0
  while (round.type === 'tools') {
    throwIfAborted(deps.signal)
    if (toolSteps >= MAX_TOOL_STEPS) break
    const room = MAX_TOOL_STEPS - toolSteps
    const calls = round.calls.slice(0, room)
    messages.push({ role: 'assistant', content: '', toolCalls: calls })
    for (const call of calls) {
      toolSteps += 1
      const content = await executeCall(call, deps, trace, allowed)
      messages.push({
        role: 'tool',
        content,
        toolCallId: call.id,
        name: call.name,
      })
    }
    if (toolSteps >= MAX_TOOL_STEPS) break
    round = await deps.completeWithTools(messages, deps.signal)
    if (round.usage) mergeUsage(usage, round.usage)
    if (round.type === 'unsupported') break
    if (round.type === 'text') {
      deps.onStatus?.({ phase: 'answering', detail: '' })
      if (round.text) deps.onToken(round.text)
      return { text: round.text, trace, usage, mode: 'tools' }
    }
  }

  deps.onStatus?.({ phase: 'answering', detail: '' })
  let text = ''
  const streamed = await deps.streamAnswer(messages, (token) => {
    text += token
    deps.onToken(token)
  }, deps.signal)
  mergeUsage(usage, streamed)
  return { text, trace, usage, mode: 'tools' }
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
