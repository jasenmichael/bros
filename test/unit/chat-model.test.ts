import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('conversation modelId', () => {
  let dataDir = ''

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-chat-'))
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

  it('keeps create-time modelId when stream body omits modelId', async () => {
    const { createConversation, resolveConversationModel } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/freehuntx/qwen3-coder:14b')
    expect(convo?.id).toBeTruthy()
    expect(resolveConversationModel(convo!.id)).toBe('ollama/freehuntx/qwen3-coder:14b')
  })

  it('stream/send uses updated modelId after change', async () => {
    const { createConversation, getConversation, resolveConversationModel } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/freehuntx/qwen3-coder:14b')
    const used = resolveConversationModel(convo!.id, 'ollama/qwen3.8:27b')
    expect(used).toBe('ollama/qwen3.8:27b')
    expect(getConversation(convo!.id)?.modelId).toBe('ollama/qwen3.8:27b')
  })

  it('returns null for a missing conversation', async () => {
    const { resolveConversationModel } = await import('../../src/server/utils/chat')
    expect(resolveConversationModel('missing', 'ollama/qwen3.8:27b')).toBeNull()
  })

  it('stores modelId on the assistant message used for that request', async () => {
    const { addMessage, createConversation, getConversation, resolveConversationModel } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    const used = resolveConversationModel(convo!.id, 'ollama/qwen3.8:27b')
    addMessage(convo!.id, 'user', 'hello')
    addMessage(convo!.id, 'assistant', 'ok', used || undefined)
    const msgs = getConversation(convo!.id)!.messages
    expect(msgs.find((m) => m.role === 'user')?.modelId).toBeNull()
    expect(msgs.find((m) => m.role === 'assistant')?.modelId).toBe('ollama/qwen3.8:27b')
  })

  it('leaves historical assistant rows without modelId as null', async () => {
    const { addMessage, createConversation, getConversation } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'assistant', 'old reply')
    expect(getConversation(convo!.id)?.messages[0]?.modelId).toBeNull()
  })

  it('stores duration and token counts on the assistant message', async () => {
    const { addMessage, createConversation, getConversation } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'assistant', 'ok', 'ollama/llama3.2', {
      durationMs: 1400,
      promptTokens: 100,
      completionTokens: 28,
    })
    const row = getConversation(convo!.id)?.messages[0]
    expect(row?.durationMs).toBe(1400)
    expect(row?.promptTokens).toBe(100)
    expect(row?.completionTokens).toBe(28)
  })

  it('leaves historical assistant rows without stats as null', async () => {
    const { addMessage, createConversation, getConversation } = await import('../../src/server/utils/chat')
    const convo = createConversation('ollama/llama3.2')
    addMessage(convo!.id, 'assistant', 'old reply')
    const row = getConversation(convo!.id)?.messages[0]
    expect(row?.durationMs).toBeNull()
    expect(row?.promptTokens).toBeNull()
    expect(row?.completionTokens).toBeNull()
  })
})
