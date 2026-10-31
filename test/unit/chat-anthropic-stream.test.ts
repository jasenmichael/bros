import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('Anthropic Messages chat stream', () => {
  let dataDir = ''
  let originalFetch: typeof fetch

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-chat-anthropic-'))
    process.env.BROS_DATA_DIR = dataDir
    process.env.BROS_WORKING_DIR = dataDir
    const { resetDbForTests } = await import('../../app/server/utils/db')
    resetDbForTests()
    originalFetch = globalThis.fetch
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    const { resetDbForTests } = await import('../../app/server/utils/db')
    resetDbForTests()
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('posts /messages with Anthropic headers and reads content_block_delta', async () => {
    const { ensureDefaultProviders, upsertProvider } = await import('../../app/server/utils/providers')
    const { streamChat } = await import('../../app/server/utils/chat/chat')
    ensureDefaultProviders()
    upsertProvider({
      id: 'anthropic',
      name: 'Anthropic',
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      enabled: true,
    })

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      const payload = [
        `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: 'hi' } })}`,
        `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 1 } })}`,
        '',
      ].join('\n')
      return new Response(payload, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch

    const tokens: string[] = []
    await streamChat({
      modelId: 'anthropic/claude-sonnet-4-6',
      history: [{ role: 'user', content: 'hello' }],
      onToken: (t) => tokens.push(t),
    })

    expect(tokens.join('')).toBe('hi')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages')
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-ant-test')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers.authorization).toBeUndefined()
    const body = JSON.parse(String(calls[0]?.init?.body))
    expect(body.stream).toBe(true)
    expect(body.model).toBe('claude-sonnet-4-6')
    expect(body.max_tokens).toBe(2048)
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
  })
})
