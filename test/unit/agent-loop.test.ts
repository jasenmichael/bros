import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_TOOL_STEPS, runAgentLoop, urlsInText, type AgentMsg, type AgentTool, type ToolContext } from '../../src/server/utils/agentLoop'
import { AGENT_TOOLS } from '../../src/server/utils/agentTools'
import { shortProviderError, toAnthropicMessages, toOllamaMessages, toOpenAIMessages } from '../../src/server/utils/agentModel'
import type { SearchHit } from '../../src/server/utils/firecrawl'

const hits: SearchHit[] = [
  { title: 'One', url: 'https://example.com/one', snippet: 'first' },
  { title: 'Two', url: 'https://example.com/two', snippet: 'second' },
]

function history(): AgentMsg[] {
  return [{ role: 'user', content: 'What is example?' }]
}

function tool(name: string, execute: AgentTool['execute']): AgentTool {
  return {
    name,
    description: name,
    parameters: { type: 'object', properties: {} },
    execute,
  }
}

function base(over: Partial<Parameters<typeof runAgentLoop>[1]> = {}) {
  return {
    completeWithTools: async () => ({ type: 'text' as const, text: 'ok' }),
    streamAnswer: async (_messages: AgentMsg[], onToken: (token: string) => void) => {
      onToken('streamed')
      return {}
    },
    tools: [] as AgentTool[],
    search: async () => [] as SearchHit[],
    scrape: async () => '',
    root: '/tmp',
    onToken: () => {},
    ...over,
  }
}

describe('runAgentLoop', () => {
  it('keeps a text reply and does not run tools', async () => {
    let ran = 0
    let streamed = 0
    const result = await runAgentLoop(history(), base({
      completeWithTools: async () => ({ type: 'text', text: 'Two plus two is four.' }),
      streamAnswer: async () => {
        streamed += 1
        return {}
      },
      tools: [tool('web_search', async () => {
        ran += 1
        return 'hit'
      })],
    }))
    expect(result.mode).toBe('answer')
    expect(result.text).toBe('Two plus two is four.')
    expect(ran).toBe(0)
    expect(streamed).toBe(0)
  })

  it('runs search then fetch and shows the tool result to the answer call', async () => {
    const ran: string[] = []
    let round = 0
    let answerMessages: AgentMsg[] = []
    const result = await runAgentLoop(history(), base({
      tools: [
        tool('web_search', async () => {
          ran.push('web_search')
          return 'One\nhttps://example.com/one'
        }),
        tool('web_fetch', async () => {
          ran.push('web_fetch')
          return 'page body about example'
        }),
      ],
      completeWithTools: async (messages) => {
        round += 1
        if (round === 1) {
          return { type: 'tools', calls: [{ id: 's', name: 'web_search', args: { query: 'example' } }] }
        }
        if (round === 2) {
          return { type: 'tools', calls: [{ id: 'f', name: 'web_fetch', args: { url: 'https://example.com/one' } }] }
        }
        answerMessages = messages
        return { type: 'text', text: 'Example is a site.' }
      },
    }))
    expect(ran).toEqual(['web_search', 'web_fetch'])
    expect(result.mode).toBe('tools')
    expect(result.text).toBe('Example is a site.')
    const user = answerMessages.find((m) => m.role === 'user')
    expect(user?.content).toBe('What is example?')
    const toolRows = answerMessages.filter((m) => m.role === 'tool')
    expect(toolRows.map((m) => m.content)).toEqual([
      'One\nhttps://example.com/one',
      'page body about example',
    ])
    expect(answerMessages.some((m) => m.content.includes('page body about example') && m.role === 'user')).toBe(false)
  })

  it('stops at the step cap and asks for a normal answer', async () => {
    let asks = 0
    let streamed = 0
    const result = await runAgentLoop(history(), base({
      tools: [tool('web_search', async () => 'hit')],
      completeWithTools: async () => {
        asks += 1
        return { type: 'tools', calls: [{ id: `c${asks}`, name: 'web_search', args: { query: 'example' } }] }
      },
      streamAnswer: async (messages, onToken) => {
        streamed += 1
        expect(messages.filter((m) => m.role === 'tool')).toHaveLength(MAX_TOOL_STEPS)
        onToken('final')
        return {}
      },
    }))
    expect(asks).toBe(MAX_TOOL_STEPS)
    expect(streamed).toBe(1)
    expect(result.text).toBe('final')
    expect(result.mode).toBe('tools')
  })

  it('returns an unknown tool error and continues', async () => {
    let round = 0
    let toolText = ''
    const result = await runAgentLoop(history(), base({
      completeWithTools: async (messages) => {
        round += 1
        if (round === 1) return { type: 'tools', calls: [{ id: 'x', name: 'nope', args: {} }] }
        toolText = messages.find((m) => m.role === 'tool')?.content || ''
        return { type: 'text', text: 'continued' }
      },
    }))
    expect(toolText).toBe('Unknown tool nope')
    expect(result.text).toBe('continued')
    expect(result.mode).toBe('tools')
  })

  it('answers without tools when the first reply is blank or tools are unsupported', async () => {
    let ran = 0
    const blank = await runAgentLoop(history(), base({
      completeWithTools: async () => ({ type: 'text', text: '   ' }),
      tools: [tool('web_search', async () => {
        ran += 1
        return 'hit'
      })],
      streamAnswer: async (_messages, onToken) => {
        onToken('plain')
        return {}
      },
    }))
    const unsupported = await runAgentLoop(history(), base({
      completeWithTools: async () => ({ type: 'unsupported' }),
      tools: [tool('web_search', async () => {
        ran += 1
        return 'hit'
      })],
      streamAnswer: async (_messages, onToken) => {
        onToken('plain too')
        return {}
      },
    }))
    expect(ran).toBe(0)
    expect(blank.mode).toBe('answer')
    expect(blank.text).toBe('plain')
    expect(unsupported.mode).toBe('answer')
    expect(unsupported.text).toBe('plain too')
    expect(urlsInText('see http://10.0.0.5/x')).toEqual([])
  })

  it('gives a timed-out tool back to the model and continues', async () => {
    let round = 0
    let toolText = ''
    const result = await runAgentLoop(history(), base({
      tools: [tool('web_search', async () => {
        throw new Error('Firecrawl timed out')
      })],
      completeWithTools: async (messages) => {
        round += 1
        if (round === 1) return { type: 'tools', calls: [{ id: 's', name: 'web_search', args: { query: 'example' } }] }
        toolText = messages.find((m) => m.role === 'tool')?.content || ''
        return { type: 'text', text: 'No pages, but here is an answer.' }
      },
    }))
    expect(toolText).toBe('Firecrawl timed out')
    expect(result.text).toBe('No pages, but here is an answer.')
  })
})

describe('provider tool replay', () => {
  const raw = {
    id: 'call_1',
    type: 'function',
    function: { name: 'web_search', arguments: '{"query":"example"}' },
    extra_content: { google: { thought_signature: 'sig' } },
  }
  const messages: AgentMsg[] = [
    { role: 'user', content: 'look' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'call_1', name: 'web_search', args: { query: 'example' }, raw }],
    },
    { role: 'tool', content: 'hits', toolCallId: 'call_1', name: 'web_search' },
  ]

  it('replays the original OpenAI tool call, including Gemini extra_content', () => {
    const sent = toOpenAIMessages(messages)
    const assistant = sent[1] as { tool_calls: unknown[] }
    expect(assistant.tool_calls[0]).toEqual(raw)
    expect(sent[2]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: 'hits' })
  })

  it('replays Ollama tool calls and tool_name', () => {
    const ollamaRaw = { function: { name: 'web_search', arguments: { query: 'example' } } }
    const sent = toOllamaMessages([
      messages[0]!,
      { role: 'assistant', content: '', toolCalls: [{ id: 'c', name: 'web_search', args: { query: 'example' }, raw: ollamaRaw }] },
      messages[2]!,
    ])
    const assistant = sent[1] as { tool_calls: unknown[] }
    expect(assistant.tool_calls[0]).toEqual(ollamaRaw)
    expect(sent[2]).toEqual({ role: 'tool', content: 'hits', tool_name: 'web_search' })
  })

  it('groups Anthropic tool results into one user message', () => {
    const block = { type: 'tool_use', id: 'tu_1', name: 'web_search', input: { query: 'example' } }
    const sent = toAnthropicMessages([
      { role: 'system', content: 'persona' },
      { role: 'user', content: 'look' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'tu_1', name: 'web_search', args: { query: 'example' }, raw: block }] },
      { role: 'tool', content: 'hits', toolCallId: 'tu_1', name: 'web_search' },
    ])
    expect(sent[0]).toEqual({ role: 'user', content: 'look' })
    expect(sent[1]).toEqual({ role: 'assistant', content: [block] })
    expect(sent[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'hits' }],
    })
  })

  it('shortens a Gemini quota error', () => {
    const body = JSON.stringify([{
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        details: [
          { violations: [{ quotaValue: '20' }] },
          { retryDelay: '50s' },
        ],
      },
    }])
    expect(shortProviderError(429, body, 'gemini-3.7-flash')).toBe(
      'Gemini quota exceeded for gemini-3.7-flash (20 requests per day). Retry in 50s.',
    )
    expect(shortProviderError(401, '{}', 'm')).toBe('The model provider rejected the API key.')
    expect(shortProviderError(500, 'nope', 'm')).toBe('The model provider returned 500.')
  })
})

describe('read-only tools', () => {
  it('reads only inside the working directory and fetches only allowed public urls', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bros-tools-'))
    try {
      await mkdir(join(root, 'src'))
      await writeFile(join(root, 'src', 'note.txt'), 'hello bros\n')
      const list = AGENT_TOOLS.find((item) => item.name === 'list_dir')!
      const read = AGENT_TOOLS.find((item) => item.name === 'read_file')!
      const grep = AGENT_TOOLS.find((item) => item.name === 'grep')!
      const search = AGENT_TOOLS.find((item) => item.name === 'web_search')!
      const fetchTool = AGENT_TOOLS.find((item) => item.name === 'web_fetch')!
      const ctx: ToolContext = {
        root,
        allowedUrls: new Set(),
        trace: { queries: [], sources: [] },
        search: async () => hits,
        scrape: async (url) => `markdown ${url}`,
      }
      expect(await list.execute({ path: '.' }, ctx)).toContain('src/')
      expect(await read.execute({ path: 'src/note.txt' }, ctx)).toBe('hello bros\n')
      expect(await read.execute({ path: '../note.txt' }, ctx)).toMatch(/Refused/)
      expect(await grep.execute({ pattern: 'bros', path: '.' }, ctx)).toContain('src/note.txt:1:hello bros')
      expect(await search.execute({ query: 'example' }, ctx)).toContain('https://example.com/one')
      expect(await fetchTool.execute({ url: 'https://example.com/one' }, ctx)).toContain('markdown')
      expect(await fetchTool.execute({ url: 'https://evil.example/secret' }, ctx)).toMatch(/Refused/)
      expect(ctx.trace.sources.map((source) => source.url)).toContain('https://example.com/one')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
