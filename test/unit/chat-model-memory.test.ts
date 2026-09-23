import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_MODEL_MEMORY_DEFAULTS,
  CHAT_MODEL_MEMORY_KEY,
  readChatModelMemory,
  rememberChatModel,
  rememberChatProvider,
  writeChatModelMemory,
} from '../../src/app/composables/useChatModelMemory'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  })
})

describe('chat model memory', () => {
  it('returns the cold-start provider when the key is missing', () => {
    expect(readChatModelMemory()).toEqual({
      lastProviderId: CHAT_MODEL_MEMORY_DEFAULTS.lastProviderId,
      models: {},
    })
  })

  it('ignores bad JSON', () => {
    store.set(CHAT_MODEL_MEMORY_KEY, '{')
    expect(readChatModelMemory()).toEqual({
      lastProviderId: 'ollama',
      models: {},
    })
  })

  it('round-trips the last provider and each provider model', () => {
    writeChatModelMemory({ lastProviderId: 'openai', models: { openai: 'gpt-4o-mini' } })
    expect(readChatModelMemory()).toEqual({
      lastProviderId: 'openai',
      models: { openai: 'gpt-4o-mini' },
    })
    rememberChatProvider('ollama')
    rememberChatModel('ollama', 'qwen2.5')
    rememberChatModel('openai', 'gpt-4o')
    expect(readChatModelMemory()).toEqual({
      lastProviderId: 'openai',
      models: { openai: 'gpt-4o', ollama: 'qwen2.5' },
    })
  })
})
