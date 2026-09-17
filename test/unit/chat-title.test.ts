import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_CHAT_TITLE,
  fallbackTitleFromPrompt,
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

  it('uses fallback when generate returns empty or huge text', () => {
    expect(sanitizeGeneratedTitle('   ', 'Explain Docker')).toBe('Explain Docker')
    expect(sanitizeGeneratedTitle('x'.repeat(81), 'Explain Docker')).toBe('Explain Docker')
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

  it('titles from the same model after the first assistant reply', async () => {
    const { addMessage, createConversation, getConversation, maybeAutoTitle } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'user', 'Explain Docker volumes')
    addMessage(convo!.id, 'assistant', 'Volumes persist data.')
    const used: string[] = []
    const title = await maybeAutoTitle(convo!.id, async (modelId, prompt) => {
      used.push(modelId, prompt)
      return '"Docker volumes"'
    })
    expect(used[0]).toBe('ollama/llama3.2')
    expect(used[1]).toContain('Explain Docker volumes')
    expect(title).toBe('Docker volumes')
    expect(getConversation(convo!.id)?.title).toBe('Docker volumes')
  })

  it('keeps first-line fallback when summarize fails', async () => {
    const { addMessage, createConversation, getConversation, maybeAutoTitle } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'user', 'Explain Docker volumes')
    addMessage(convo!.id, 'assistant', 'Volumes persist data.')
    const title = await maybeAutoTitle(convo!.id, async () => {
      throw new Error('model down')
    })
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
