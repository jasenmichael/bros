import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CHAT_TITLE } from '../../src/server/utils/chatTitle'

describe('conversation truncate', () => {
  let dataDir = ''

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-chat-truncate-'))
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

  it('deletes that user turn and every later row', async () => {
    const { addMessage, createConversation, getConversation, truncateConversationMessages } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    const u1 = addMessage(convo!.id, 'user', 'first')
    addMessage(convo!.id, 'assistant', 'ok')
    const u2 = addMessage(convo!.id, 'user', 'second')
    addMessage(convo!.id, 'assistant', 'later')
    const next = truncateConversationMessages(convo!.id, { fromMessageId: u2 })
    expect(next?.messages.map((m) => m.content)).toEqual(['first', 'ok'])
    expect(getConversation(convo!.id)?.messages.find((m) => m.id === u1)?.content).toBe('first')
    expect(getConversation(convo!.id)?.messages.some((m) => m.role === 'assistant' && m.content === 'later')).toBe(false)
  })

  it('truncates from fromIndex when the client id does not match', async () => {
    const { addMessage, createConversation, truncateConversationMessages } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'user', 'first')
    addMessage(convo!.id, 'assistant', 'ok')
    addMessage(convo!.id, 'user', 'second')
    addMessage(convo!.id, 'assistant', 'later')
    const next = truncateConversationMessages(convo!.id, { fromMessageId: 'client-uuid', fromIndex: 2 })
    expect(next?.messages.map((m) => m.content)).toEqual(['first', 'ok'])
  })

  it('refuses to cut on an assistant row', async () => {
    const { addMessage, createConversation, getConversation, truncateConversationMessages } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'user', 'first')
    const a1 = addMessage(convo!.id, 'assistant', 'ok')
    addMessage(convo!.id, 'user', 'second')
    expect(truncateConversationMessages(convo!.id, { fromMessageId: a1 })).toBeNull()
    expect(getConversation(convo!.id)?.messages).toHaveLength(3)
  })

  it('does not retitle after truncating later turns', async () => {
    const { addMessage, createConversation, getConversation, maybeAutoTitle, truncateConversationMessages, updateConversationTitle } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'user', 'first')
    addMessage(convo!.id, 'assistant', 'ok')
    const u2 = addMessage(convo!.id, 'user', 'second')
    addMessage(convo!.id, 'assistant', 'later')
    updateConversationTitle(convo!.id, 'Keep me')
    truncateConversationMessages(convo!.id, { fromMessageId: u2 })
    await maybeAutoTitle(convo!.id, async () => 'Should not apply')
    expect(getConversation(convo!.id)?.title).toBe('Keep me')
    expect(getConversation(convo!.id)?.title).not.toBe(DEFAULT_CHAT_TITLE)
  })

  it('aborts an in-flight stream generation so a late persist is stale', async () => {
    const { abortConversationStream, beginConversationStream, isCurrentConversationStream } = await import('../../src/server/utils/chat')
    const job = beginConversationStream('convo-1')
    expect(isCurrentConversationStream('convo-1', job.generation)).toBe(true)
    abortConversationStream('convo-1')
    expect(job.signal.aborted).toBe(true)
    expect(isCurrentConversationStream('convo-1', job.generation)).toBe(false)
  })
})
