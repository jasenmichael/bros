import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CHAT_TITLE,
  fallbackTitleFromPrompt,
  labelRequestContent,
  sanitizeGeneratedTitle,
  shouldAutoTitle,
} from '../../src/server/utils/chatTitle'

describe('chat title helpers', () => {
  it('falls back to New chat when the prompt is empty', () => {
    expect(fallbackTitleFromPrompt('   ')).toBe(DEFAULT_CHAT_TITLE)
  })

  it('uses the first line of the prompt, trimmed', () => {
    expect(fallbackTitleFromPrompt('  Explain Docker\nmore')).toBe('Explain Docker')
  })

  it('strips wrapping quotes from a generated title', () => {
    expect(sanitizeGeneratedTitle('"Docker volumes"', 'fallback')).toBe('Docker volumes')
  })

  it('keeps a 2–5 word label without punctuation', () => {
    expect(sanitizeGeneratedTitle('Cloudflare Docker Setup', 'fallback')).toBe('Cloudflare Docker Setup')
  })

  it('uses fallback for one word, six words, or leftover punctuation', () => {
    expect(sanitizeGeneratedTitle('Hi', 'Explain Docker')).toBe('Explain Docker')
    expect(sanitizeGeneratedTitle('one two three four five six', 'Explain Docker')).toBe('Explain Docker')
    expect(sanitizeGeneratedTitle('Cloudflare Docker Setup!', 'Explain Docker')).toBe('Cloudflare Docker Setup')
    expect(sanitizeGeneratedTitle('Cloudflare (Docker) Setup', 'Explain Docker')).toBe('Explain Docker')
  })

  it('keeps a short Label with an apostrophe instead of the raw prompt', () => {
    expect(sanitizeGeneratedTitle("I Can't Sleep", 'I can not sleep, what can help?')).toBe("I Can't Sleep")
    expect(sanitizeGeneratedTitle('I Can’t Sleep', 'I can not sleep, what can help?')).toBe("I Can't Sleep")
  })

  it('uses fallback when generate returns empty or huge text', () => {
    expect(sanitizeGeneratedTitle('   ', 'Explain Docker')).toBe('Explain Docker')
    expect(sanitizeGeneratedTitle('x'.repeat(81), 'Explain Docker')).toBe('Explain Docker')
  })

  it('rejects specialist SYSTEM-prompt regurgitation only', () => {
    expect(sanitizeGeneratedTitle('Bros Model Label', 'how are you?')).toBe('how are you?')
    expect(sanitizeGeneratedTitle('Bros Model', 'hello')).toBe('hello')
    expect(sanitizeGeneratedTitle('Label', 'good morning')).toBe('good morning')
    expect(sanitizeGeneratedTitle('Docker Volumes', 'Explain Docker volumes')).toBe('Docker Volumes')
    expect(sanitizeGeneratedTitle('How are You', 'how are you?')).toBe('How are You')
    expect(sanitizeGeneratedTitle('Hello Chat', 'hello')).toBe('Hello Chat')
    expect(sanitizeGeneratedTitle('Baby Friendly Label', 'hey baby')).toBe('Baby Friendly Label')
    expect(sanitizeGeneratedTitle('Hi, Name', 'hi, how are you')).toBe('Hi Name')
  })

  it('builds the Label: request the specialist was trained on', () => {
    expect(labelRequestContent('Explain Docker volumes')).toBe('Label: Explain Docker volumes')
  })

  it('only auto-titles the first assistant reply while still New chat', () => {
    expect(shouldAutoTitle(DEFAULT_CHAT_TITLE, 1)).toBe(true)
    expect(shouldAutoTitle(DEFAULT_CHAT_TITLE, 2)).toBe(false)
    expect(shouldAutoTitle('Docker volumes', 1)).toBe(false)
  })
})

describe('conversation title persist', () => {
  let dataDir = ''

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-chat-title-'))
    process.env.BROS_DATA_DIR = dataDir
    process.env.BROS_WORKING_DIR = dataDir
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
  })

  afterEach(async () => {
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
    vi.unstubAllGlobals()
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('persists a rename and does not change modelId', async () => {
    const { createConversation, getConversation, updateConversationTitle } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    updateConversationTitle(convo!.id, 'Docker volumes')
    const next = getConversation(convo!.id)
    expect(next?.title).toBe('Docker volumes')
    expect(next?.modelId).toBe('ollama/llama3.2')
  })

  it('deletes a conversation and its messages', async () => {
    const { addMessage, createConversation, deleteConversation, getConversation, listConversations } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'user', 'hello')
    deleteConversation(convo!.id)
    expect(getConversation(convo!.id)).toBeNull()
    expect(listConversations()).toHaveLength(0)
  })

  it('titles from sidecar bros with Label: after the first assistant reply', async () => {
    const { addMessage, createConversation, generateChatTitle, getConversation, maybeAutoTitle } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'user', 'Explain Docker volumes')
    addMessage(convo!.id, 'assistant', 'Volumes persist data.')
    const { sidecarOllamaUrl } = await import('../../src/server/utils/ollamaHost')
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe(`${sidecarOllamaUrl()}/api/chat`)
      const body = JSON.parse(String(init?.body || '{}')) as { model?: string; stream?: boolean; messages?: Array<{ content?: string }> }
      expect(body.model).toBe('bros')
      expect(body.stream).toBe(false)
      expect(body.messages?.[0]?.content).toBe('Label: Explain Docker volumes')
      return new Response(JSON.stringify({ message: { content: 'Docker volumes' } }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const raw = await generateChatTitle('ollama/llama3.2', 'Explain Docker volumes')
    expect(raw).toBe('Docker volumes')
    const title = await maybeAutoTitle(convo!.id)
    expect(title).toBe('Docker volumes')
    expect(getConversation(convo!.id)?.title).toBe('Docker volumes')
    expect(fetchMock).toHaveBeenCalled()
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toMatch(/11436|22000|127\.0\.0\.1:11434/)
  })

  it('still titles via sidecar bros when ollama is disabled for chat', async () => {
    const { addMessage, createConversation, generateChatTitle, maybeAutoTitle } = await import('../../src/server/utils/chat')
    const { ensureDefaultProviders, getProvider, setProviderEnabled } = await import('../../src/server/utils/providers')
    const { sidecarOllamaUrl } = await import('../../src/server/utils/ollamaHost')
    ensureDefaultProviders()
    await setProviderEnabled('ollama', false)
    expect(getProvider('ollama')?.enabled).toBe(false)
    const convo = createConversation('ollama-host/llama3.2')
    addMessage(convo!.id, 'user', 'Explain Docker volumes')
    addMessage(convo!.id, 'assistant', 'Volumes persist data.')
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toBe(`${sidecarOllamaUrl()}/api/chat`)
      return new Response(JSON.stringify({ message: { content: 'Docker volumes' } }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const raw = await generateChatTitle('ollama-host/llama3.2', 'Explain Docker volumes')
    expect(raw).toBe('Docker volumes')
    const title = await maybeAutoTitle(convo!.id)
    expect(title).toBe('Docker volumes')
    expect(fetchMock).toHaveBeenCalled()
    expect(getProvider('ollama')?.enabled).toBe(false)
    expect(getProvider('ollama-host')?.enabled).toBe(true)
  })

  it('persists I Can\'t Sleep instead of the raw first prompt', async () => {
    const { addMessage, createConversation, getConversation, maybeAutoTitle } = await import('../../src/server/utils/chat')
    const prompt = 'I can not sleep, what can help?'
    const convo = createConversation('ollama/gemma3:12b')
    addMessage(convo!.id, 'user', prompt)
    addMessage(convo!.id, 'assistant', 'Try a dark room.')
    const title = await maybeAutoTitle(convo!.id, async () => "I Can't Sleep")
    expect(title).toBe("I Can't Sleep")
    expect(getConversation(convo!.id)?.title).toBe("I Can't Sleep")
  })

  it('keeps first-line fallback when generate returns SYSTEM regurgitation', async () => {
    const { addMessage, createConversation, getConversation, maybeAutoTitle } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'user', 'how are you?')
    addMessage(convo!.id, 'assistant', 'Fine.')
    const title = await maybeAutoTitle(convo!.id, async () => 'Bros Model Label')
    expect(title).toBe('how are you?')
    expect(getConversation(convo!.id)?.title).toBe('how are you?')
  })

  it('keeps first-line fallback when summarize fails', async () => {
    const { addMessage, createConversation, getConversation, maybeAutoTitle } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'user', 'Explain Docker volumes')
    addMessage(convo!.id, 'assistant', 'Volumes persist data.')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const title = await maybeAutoTitle(convo!.id, async () => {
      throw new Error('model down')
    })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    expect(title).toBe('Explain Docker volumes')
    expect(getConversation(convo!.id)?.title).toBe('Explain Docker volumes')
  })

  it('does not retitle later messages or a renamed chat', async () => {
    const { addMessage, createConversation, getConversation, maybeAutoTitle, updateConversationTitle } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'user', 'first')
    addMessage(convo!.id, 'assistant', 'ok')
    updateConversationTitle(convo!.id, 'Keep me')
    await maybeAutoTitle(convo!.id, async () => 'Should not apply')
    expect(getConversation(convo!.id)?.title).toBe('Keep me')

    const other = createConversation('ollama/llama3.2')
    addMessage(other!.id, 'user', 'one')
    addMessage(other!.id, 'assistant', 'a')
    addMessage(other!.id, 'user', 'two')
    addMessage(other!.id, 'assistant', 'b')
    await maybeAutoTitle(other!.id, async () => 'Second reply title')
    expect(getConversation(other!.id)?.title).toBe(DEFAULT_CHAT_TITLE)
  })
})
