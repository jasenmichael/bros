import { applyChatSettings, getChatSettings } from './chatSettings'
import { completeProviderTools, streamProviderAnswer } from './agentModel'
import { runAgentLoop, type AgentLoopResult, type AgentMsg, type AgentStatus } from './agentLoop'
import { firecrawlScrape, firecrawlSearch } from './firecrawl'

export async function runAgentResearch(opts: {
  modelId: string
  history: Array<{ role: string; content: string }>
  signal?: AbortSignal
  onStatus?: (status: AgentStatus) => void
  onToken: (token: string) => void
}): Promise<AgentLoopResult> {
  const lastUser = [...opts.history].reverse().find((m) => m.role === 'user')?.content || ''
  const seeded: AgentMsg[] = applyChatSettings(opts.history, getChatSettings()).map((m) => ({
    role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
    content: m.content,
  }))
  return runAgentLoop(seeded, {
    completeWithTools: (messages, signal) => completeProviderTools({ modelId: opts.modelId, messages, signal }),
    streamAnswer: (messages, onToken, signal) => streamProviderAnswer({
      modelId: opts.modelId,
      messages,
      onToken,
      signal,
    }),
    search: (query, signal) => firecrawlSearch(query, signal),
    scrape: (url, signal) => firecrawlScrape(url, signal),
    onStatus: opts.onStatus,
    onToken: opts.onToken,
    signal: opts.signal,
    retrieveQuery: lastUser.trim(),
  })
}
