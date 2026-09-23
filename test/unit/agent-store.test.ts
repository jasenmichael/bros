import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('agent conversations', () => {
  let dataDir = ''

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-agent-'))
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

  it('keeps agent threads out of the chat list and stores the tool trace', async () => {
    const {
      addMessage,
      createConversation,
      getAgentConversation,
      getChatConversation,
      listAgentConversations,
      listConversations,
    } = await import('../../src/server/utils/chat')
    const chat = createConversation('ollama/llama3.2')
    const agent = createConversation('ollama/llama3.2', 'New chat', 'agent')
    const trace = JSON.stringify({ queries: ['example'], sources: [{ title: 'One', url: 'https://example.com/one' }] })
    addMessage(agent!.id, 'assistant', 'Answer', 'ollama/llama3.2', undefined, trace)

    expect(listConversations().map((row) => row.id)).toEqual([chat!.id])
    expect(listAgentConversations().map((row) => row.id)).toEqual([agent!.id])
    expect(getChatConversation(agent!.id)).toBeNull()
    expect(getAgentConversation(chat!.id)).toBeNull()
    expect(getAgentConversation(agent!.id)?.messages[0]?.traceJson).toBe(trace)
  })
})
