import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

mockNuxtImport('useFetch', () => {
  return (url?: string) => {
    if (url === '/api/chat') {
      return {
        data: ref({ conversations: [] }),
        refresh: async () => {},
        pending: ref(false),
      }
    }
    if (String(url || '').includes('models/context')) {
      return {
        data: ref({ contextLength: 8192 }),
        refresh: async () => {},
        pending: ref(false),
      }
    }
    return {
      data: ref({
        providers: [
          { id: 'ollama', name: 'Ollama (core)', kind: 'ollama', enabled: false, models: [{ name: 'llama3.2', enabled: true }] },
          { id: 'ollama-host', name: 'Ollama (host)', kind: 'ollama', enabled: true, models: [{ name: 'llama3.2', enabled: true }] },
          { id: 'openai', name: 'OpenAI', kind: 'openai', popular: true, enabled: true, models: [] },
          { id: 'my-proxy', name: 'My proxy', kind: 'openai', enabled: true, models: [] },
        ],
      }),
      refresh: async () => {},
      pending: ref(false),
    }
  }
})

mockNuxtImport('useSeoMeta', () => () => {})

describe('Chat page with a disabled provider', () => {
  it('omits the disabled provider and falls back to the next enabled one', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as { orderedProviders: Array<{ id: string }>; providerId: string }
    expect(vm.orderedProviders.map((p) => p.id)).toEqual(['ollama-host', 'openai', 'my-proxy'])
    expect(vm.providerId).toBe('ollama-host')
    expect(wrapper.text()).not.toMatch(/Ollama \(core\)/)
  })
})
