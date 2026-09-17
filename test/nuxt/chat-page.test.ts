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
    return {
      data: ref({
        providers: [{ id: 'ollama', name: 'Ollama', kind: 'ollama', baseUrl: 'http://ollama:11434', config: { mode: 'sidecar' } }],
        ollamaModels: [{ id: 'ollama/llama3.2' }],
        ollamaSource: 'sidecar',
        sidecarPublish: 11435,
        hostOllama: { port: 11434, version: '0.9.0' },
      }),
      refresh: async () => {},
      pending: ref(false),
    }
  }
})

mockNuxtImport('useSeoMeta', () => () => {})

describe('Chat page', () => {
  it('centers greeting and composer on empty /chat', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    expect(wrapper.text()).toContain('What should we run?')
    expect(wrapper.find('.bros-chat--empty').exists()).toBe(true)
    expect(wrapper.find('.bros-chat__thread').exists()).toBe(false)
    expect(wrapper.text()).toContain('Host :11434')
    expect(wrapper.text()).toContain('Sidecar :11435')
    expect(wrapper.text()).not.toContain('Bros Chat — streaming against configured models.')
    expect(wrapper.html()).not.toMatch(/uppercase">user/i)
    expect(wrapper.find('.bros-chat__composer').exists()).toBe(true)
    expect(wrapper.html()).toContain('Message…')
  })
})
