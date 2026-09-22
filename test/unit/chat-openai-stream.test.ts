import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('OpenAI-compat chat stream', () => {
  let dataDir = ''
  let originalFetch: typeof fetch

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-chat-openai-'))
    process.env.BROS_DATA_DIR = dataDir
    process.env.BROS_WORKING_DIR = dataDir
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
    originalFetch = globalThis.fetch
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('sends stream_options, reads reasoning_content, and adds OpenRouter headers', async () => {
    const { ensureDefaultProviders, upsertProvider } = await import('../../src/server/utils/providers')
    const { streamChat } = await import('../../src/server/utils/chat')
    const { getProviderPreset } = await import('../../src/server/utils/providerPresets')
    ensureDefaultProviders()
    upsertProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      kind: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-or-test',
      enabled: true,
    })

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      const payload = `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'think' } }] })}\n\ndata: [DONE]\n`
      return new Response(payload, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch

    const tokens: string[] = []
    await streamChat({
      modelId: 'openrouter/openrouter/free',
      history: [{ role: 'user', content: 'hi' }],
      onToken: (t) => tokens.push(t),
    })

    expect(tokens.join('')).toBe('think')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-or-test')
    expect(headers['HTTP-Referer']).toBe(getProviderPreset('openrouter')?.headers?.['HTTP-Referer'])
    expect(headers['X-Title']).toBe('Bros')
    const body = JSON.parse(String(calls[0]?.init?.body))
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
    expect(body.model).toBe('openrouter/free')
  })

  it('refuses a disabled provider and does not call that provider or others', async () => {
    const { ensureDefaultProviders, setProviderEnabled } = await import('../../src/server/utils/providers')
    const { streamChat } = await import('../../src/server/utils/chat')
    ensureDefaultProviders()
    await setProviderEnabled('openrouter', false)

    let fetches = 0
    globalThis.fetch = (async () => {
      fetches += 1
      return new Response('should not run', { status: 500 })
    }) as typeof fetch

    await expect(streamChat({
      modelId: 'openrouter/openrouter/free',
      history: [{ role: 'user', content: 'hi' }],
      onToken: () => {},
    })).rejects.toMatchObject({ statusCode: 400, statusMessage: 'OpenRouter is disabled for chat' })
    expect(fetches).toBe(0)
  })
})
