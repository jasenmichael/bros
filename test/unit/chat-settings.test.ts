import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyChatSettings } from '../../src/server/utils/chatSettings'

describe('applyChatSettings', () => {
  const history = [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'ok' },
    { role: 'user', content: 'second' },
  ]

  it('uses description as system and prepend on the last user', () => {
    expect(applyChatSettings(history, {
      prepend: 'Remember the repo is Bros',
      assistantDescription: 'Terse engineer',
    })).toEqual([
      { role: 'system', content: 'Terse engineer' },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'Remember the repo is Bros\n\nsecond' },
    ])
  })

  it('omits empty fields and does not mutate history', () => {
    const copy = history.map((m) => ({ ...m }))
    expect(applyChatSettings(history, { prepend: '  ', assistantDescription: '' })).toEqual(copy)
    expect(history).toEqual(copy)
  })

  it('merges description into an existing first system instead of duplicating', () => {
    expect(applyChatSettings(
      [{ role: 'system', content: 'Client system' }, { role: 'user', content: 'hi' }],
      { prepend: '', assistantDescription: 'Terse engineer' },
    )).toEqual([
      { role: 'system', content: 'Terse engineer\n\nClient system' },
      { role: 'user', content: 'hi' },
    ])
  })
})

describe('chat settings persist and stream payload', () => {
  let dataDir = ''
  let originalFetch: typeof fetch

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-chat-settings-'))
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
    vi.unstubAllGlobals()
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('stores keys in meta and applies them on OpenAI-compat send', async () => {
    const { ensureDefaultProviders, upsertProvider } = await import('../../src/server/utils/providers')
    const { setChatSettings, getChatSettings } = await import('../../src/server/utils/chatSettings')
    const { streamChat } = await import('../../src/server/utils/chat')
    ensureDefaultProviders()
    upsertProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      kind: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-or-test',
      enabled: true,
    })
    setChatSettings({ prepend: 'Repo is Bros', assistantDescription: 'Terse engineer' })
    expect(getChatSettings()).toEqual({
      prepend: 'Repo is Bros',
      assistantDescription: 'Terse engineer',
    })

    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response('data: [DONE]\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch

    await streamChat({
      modelId: 'openrouter/openrouter/free',
      history: [{ role: 'user', content: 'hello' }],
      onToken: () => {},
    })

    const body = JSON.parse(String(calls[0]?.init?.body))
    expect(body.messages).toEqual([
      { role: 'system', content: 'Terse engineer' },
      { role: 'user', content: 'Repo is Bros\n\nhello' },
    ])
  })

  it('omits settings from the provider payload when empty', async () => {
    const { ensureDefaultProviders, upsertProvider } = await import('../../src/server/utils/providers')
    const { streamChat } = await import('../../src/server/utils/chat')
    ensureDefaultProviders()
    upsertProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      kind: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-or-test',
      enabled: true,
    })

    const calls: Array<{ init?: RequestInit }> = []
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ init })
      return new Response('data: [DONE]\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch

    await streamChat({
      modelId: 'openrouter/openrouter/free',
      history: [{ role: 'user', content: 'hello' }],
      onToken: () => {},
    })

    const body = JSON.parse(String(calls[0]?.init?.body))
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('does not inject chat settings into bros Label: title generate', async () => {
    const { setChatSettings } = await import('../../src/server/utils/chatSettings')
    const { generateChatTitle } = await import('../../src/server/utils/chat')
    const { sidecarOllamaUrl } = await import('../../src/server/utils/ollamaHost')
    setChatSettings({ prepend: 'Repo is Bros', assistantDescription: 'Terse engineer' })
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe(`${sidecarOllamaUrl()}/api/chat`)
      const body = JSON.parse(String(init?.body || '{}')) as { messages?: Array<{ role?: string; content?: string }> }
      expect(body.messages).toEqual([{ role: 'user', content: 'Label: Explain Docker volumes' }])
      return new Response(JSON.stringify({ message: { content: 'Docker volumes' } }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await generateChatTitle('ollama/llama3.2', 'Explain Docker volumes')
    expect(fetchMock).toHaveBeenCalled()
  })
})
