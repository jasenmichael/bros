import { describe, expect, it } from 'vitest'
import { runAgentLoop, type AgentLoopDeps, type AgentMsg, type ToolRound } from '../../src/server/utils/agentLoop'
import type { SearchHit } from '../../src/server/utils/firecrawl'

const hits: SearchHit[] = [
  { title: 'One', url: 'https://example.com/one', snippet: 'first' },
  { title: 'Two', url: 'https://example.com/two', snippet: 'second' },
  { title: 'Three', url: 'https://example.com/three', snippet: 'third' },
]

function history(): AgentMsg[] {
  return [{ role: 'user', content: 'What is example?' }]
}

describe('runAgentLoop', () => {
  it('runs a tool call then emits the model text', async () => {
    const rounds: ToolRound[] = [
      { type: 'tools', calls: [{ id: 'c1', name: 'web_search', args: { query: 'example' } }] },
      { type: 'text', text: 'Example is a site.' },
    ]
    const searches: string[] = []
    let scrapes = 0
    const tokens: string[] = []
    const result = await runAgentLoop(history(), {
      completeWithTools: async () => rounds.shift()!,
      streamAnswer: async () => ({}),
      search: async (query) => {
        searches.push(query)
        return hits.slice(0, 1)
      },
      scrape: async () => {
        scrapes += 1
        return 'page'
      },
      onToken: (token) => tokens.push(token),
    })
    expect(searches).toEqual(['example'])
    expect(scrapes).toBe(0)
    expect(tokens).toEqual(['Example is a site.'])
    expect(result.mode).toBe('tools')
    expect(result.trace.sources.map((s) => s.url)).toEqual(['https://example.com/one'])
  })

  it('searches and scrapes itself when the model API rejects tools', async () => {
    const scraped: string[] = []
    let streamed = false
    const result = await runAgentLoop(history(), {
      completeWithTools: async () => ({ type: 'unsupported' }),
      streamAnswer: async (_messages, onToken) => {
        streamed = true
        onToken('From the pages.')
        return { completionTokens: 3 }
      },
      search: async () => hits,
      scrape: async (url) => {
        scraped.push(url)
        return `body ${url}`
      },
      onToken: () => {},
    })
    expect(result.mode).toBe('retrieve')
    expect(result.text).toBe('From the pages.')
    expect(scraped).toEqual(hits.map((hit) => hit.url))
    expect(streamed).toBe(true)
    expect(result.usage.completionTokens).toBe(3)
  })

  it('stops after 6 tool calls and streams a final answer', async () => {
    let searches = 0
    let streams = 0
    const deps: AgentLoopDeps = {
      completeWithTools: async () => ({
        type: 'tools',
        calls: [{ id: `c${searches}`, name: 'web_search', args: { query: `q${searches}` } }],
      }),
      streamAnswer: async (_messages, onToken) => {
        streams += 1
        onToken('Enough.')
        return {}
      },
      search: async () => {
        searches += 1
        return hits.slice(0, 1)
      },
      scrape: async () => 'page',
      onToken: () => {},
    }
    const result = await runAgentLoop(history(), deps)
    expect(searches).toBe(6)
    expect(streams).toBe(1)
    expect(result.text).toBe('Enough.')
    expect(result.mode).toBe('tools')
  })

  it('refuses a scrape url that search did not return', async () => {
    const rounds: ToolRound[] = [
      { type: 'tools', calls: [{ id: 'c1', name: 'web_scrape', args: { url: 'https://evil.example/secret' } }] },
      { type: 'text', text: 'I could not read that page.' },
    ]
    let scraped = 0
    const result = await runAgentLoop(history(), {
      completeWithTools: async () => rounds.shift()!,
      streamAnswer: async () => ({}),
      search: async () => hits,
      scrape: async () => {
        scraped += 1
        return 'nope'
      },
      onToken: () => {},
    })
    expect(scraped).toBe(0)
    expect(result.text).toBe('I could not read that page.')
    expect(result.trace.sources).toEqual([])
  })
})
