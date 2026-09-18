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
    if (typeof url === 'string' && url.startsWith('/api/models/context')) {
      return {
        data: ref({ contextLength: 8192 }),
        refresh: async () => {},
        pending: ref(false),
      }
    }
    return {
      data: ref({
        providers: [
          { id: 'ollama', name: 'Ollama sidecar', kind: 'ollama' },
          { id: 'ollama-host', name: 'Ollama host', kind: 'ollama' },
        ],
        ollamaModelsByProvider: {
          ollama: [{ id: 'ollama/llama3.2', name: 'llama3.2' }],
          'ollama-host': [{ id: 'ollama-host/llama3.2', name: 'llama3.2' }],
        },
        openaiModelsByProvider: {},
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
    expect(wrapper.text()).not.toContain('Host :11434')
    expect(wrapper.text()).not.toContain('Sidecar :11435')
    expect(wrapper.find('.bros-chat__provider').exists()).toBe(true)
    expect(wrapper.find('.bros-chat__model').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Bros Chat — streaming against configured models.')
    expect(wrapper.html()).not.toMatch(/uppercase">user/i)
    expect(wrapper.find('.bros-chat__composer').exists()).toBe(true)
    expect(wrapper.html()).toContain('Message…')
    expect(wrapper.find('[aria-label="Send"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Stop"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('thinking…')
    expect(wrapper.find('.bros-chat__tools-left').exists()).toBe(true)
    expect(wrapper.find('.bros-chat__ctx').text()).toBe('8k ctx')
  })

  it('shows thinking and Stop while busy, no send spinner', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as { busy: boolean; thinking: boolean }
    vm.busy = true
    vm.thinking = true
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('thinking…')
    expect(wrapper.find('[aria-label="Stop"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Send"]').exists()).toBe(false)
    expect(wrapper.find('.bros-chat__send').attributes('data-loading')).toBeUndefined()
  })
})
