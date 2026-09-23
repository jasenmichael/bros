import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { CHAT_MODEL_MEMORY_KEY } from '../../src/app/composables/useChatModelMemory'

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
          { id: 'ollama', name: 'Ollama (core)', kind: 'ollama', config: { disabledModels: ['hidden-model'] }, models: [
            { id: 'ollama/llama3.2', name: 'llama3.2', enabled: true },
            { id: 'ollama/hidden-model', name: 'hidden-model', enabled: false },
          ] },
          { id: 'ollama-host', name: 'Ollama (host)', kind: 'ollama', models: [
            { id: 'ollama-host/llama3.2', name: 'llama3.2', enabled: true },
          ] },
          { id: 'openai', name: 'OpenAI', kind: 'openai', popular: true, config: { disabledModels: ['gpt-hidden'] }, models: [
            { name: 'gpt-4o-mini', enabled: true },
            { name: 'gpt-hidden', enabled: false },
          ] },
          { id: 'my-proxy', name: 'My proxy', kind: 'openai', config: { disabledModels: ['secret-model'] }, models: [
            { name: 'qwen2.5', enabled: true },
            { name: 'secret-model', enabled: false },
          ] },
        ],
      }),
      refresh: async () => {},
      pending: ref(false),
    }
  }
})

mockNuxtImport('useSeoMeta', () => () => {})

function installChatModelStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  })
}

describe('Chat page', () => {
  beforeEach(() => {
    installChatModelStorage()
  })

  it('centers greeting and composer on empty /chat', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    expect(wrapper.text()).toContain('What should we run?')
    expect(wrapper.find('.bros-chat--empty').exists()).toBe(true)
    expect(wrapper.find('.bros-chat__thread').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Host :11434')
    expect(wrapper.text()).not.toContain('Sidecar :11435')
    expect(wrapper.find('.bros-chat__provider').exists()).toBe(true)
    expect(wrapper.find('.bros-chat__provider-wrap').exists()).toBe(true)
    expect(wrapper.find('.bros-chat__provider-sizer').exists()).toBe(true)
    expect(wrapper.findAll('.bros-chat__provider-sizer').length).toBe(1)
    expect(wrapper.find('.bros-chat__model').exists()).toBe(true)
    const vm = wrapper.vm as unknown as {
      modelPickerUi: { content: string }
      providerPickerUi: { content: string; base: string }
    }
    expect(vm.modelPickerUi.content).toContain('min-w-72')
    expect(vm.providerPickerUi.content).toContain('w-max')
    expect(vm.providerPickerUi.content).not.toContain('min-w-72')
    expect(vm.providerPickerUi.base).toContain('w-full')
    expect(vm.providerPickerUi.base).not.toContain('min-w-72')
    expect(vm.providerPickerUi.base).not.toContain('w-max')
    expect(wrapper.text()).not.toContain('Bros Chat — streaming against configured models.')
    expect(wrapper.html()).not.toMatch(/uppercase">user/i)
    expect(wrapper.find('.bros-chat__composer').exists()).toBe(true)
    expect(wrapper.html()).toContain('Message…')
    expect(wrapper.find('[aria-label="Send"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Voice to text"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Stop"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('thinking…')
    expect(wrapper.find('.bros-chat__tools-left').exists()).toBe(true)
    expect(wrapper.find('.bros-chat__ctx').text()).toBe('8k ctx')
  })

  it('omits disabled Ollama models from the picker', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as { modelsForProvider: (id: string) => string[] }
    expect(vm.modelsForProvider('ollama')).toEqual(['llama3.2'])
    expect(vm.modelsForProvider('ollama-host')).toEqual(['llama3.2'])
  })

  it('omits disabled popular and custom models from the picker', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as { modelsForProvider: (id: string) => string[] }
    expect(vm.modelsForProvider('openai')).toEqual(['gpt-4o-mini'])
    expect(vm.modelsForProvider('my-proxy')).toEqual(['qwen2.5'])
  })

  it('restores the last provider and model on a new chat', async () => {
    localStorage.setItem(CHAT_MODEL_MEMORY_KEY, JSON.stringify({
      lastProviderId: 'openai',
      models: { openai: 'gpt-4o-mini', ollama: 'llama3.2' },
    }))
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as { providerId: string; modelName: string }
    expect(vm.providerId).toBe('openai')
    expect(vm.modelName).toBe('gpt-4o-mini')
  })

  it('selects that provider’s remembered model when the provider changes', async () => {
    localStorage.setItem(CHAT_MODEL_MEMORY_KEY, JSON.stringify({
      lastProviderId: 'ollama',
      models: { ollama: 'llama3.2', 'my-proxy': 'qwen2.5' },
    }))
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as { providerId: string; modelName: string }
    vm.providerId = 'my-proxy'
    await wrapper.vm.$nextTick()
    expect(vm.modelName).toBe('qwen2.5')
  })

  it('falls back to the first enabled model when the remembered one is missing', async () => {
    localStorage.setItem(CHAT_MODEL_MEMORY_KEY, JSON.stringify({
      lastProviderId: 'openai',
      models: { openai: 'not-a-model' },
    }))
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as { providerId: string; modelName: string }
    expect(vm.providerId).toBe('openai')
    expect(vm.modelName).toBe('gpt-4o-mini')
  })

  it('orders providers sidecar, host, popular, then custom', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as { orderedProviders: Array<{ id: string }> }
    expect(vm.orderedProviders.map((p) => p.id)).toEqual(['ollama', 'ollama-host', 'openai', 'my-proxy'])
  })

  it('shows thinking and Stop while busy, no send spinner', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as { busy: boolean; thinking: boolean }
    vm.busy = true
    vm.thinking = true
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('thinking…')
    expect(wrapper.text()).toContain('0.0s')
    expect(wrapper.find('[aria-label="Stop"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Send"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Send"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[aria-label="Voice to text"]').exists()).toBe(true)
    expect(wrapper.find('.bros-chat__send').attributes('data-loading')).toBeUndefined()
  })

  it('shows the mic when the composer is docked in a thread', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as {
      messages: Array<{ id: string; role: string; content: string }>
    }
    vm.messages = [{ id: 'u1', role: 'user', content: 'hello' }]
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.bros-chat--thread').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Voice to text"]').exists()).toBe(true)
  })

  it('renders assistant markdown with docs prose in the thread', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as {
      messages: Array<{
        id: string
        role: string
        content: string
        modelId?: string
        durationMs?: number
        completionTokens?: number
      }>
    }
    vm.messages = [
      { id: 'u1', role: 'user', content: 'create a nuxt starter app' },
      {
        id: 'a1',
        role: 'assistant',
        content: '## Nuxt 3\n\n- use `nuxi init`\n\n```bash\npnpm dlx nuxi@latest init app\n```\n',
        modelId: 'ollama/gemma3:12b',
        durationMs: 59000,
        completionTokens: 12,
      },
    ]
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.bros-chat__thread').exists()).toBe(true)
    expect(wrapper.text()).toContain('ASSISTANT')
    expect(wrapper.text()).toContain('ollama/gemma3:12b')
    expect(wrapper.findAllComponents({ name: 'BrosChatMarkdown' }).length).toBeGreaterThan(0)
    expect(wrapper.find('.bros-chat-md').exists()).toBe(false)
    const assistant = wrapper.find('.bros-chat__turn--assistant')
    const html = assistant.html()
    expect(html.indexOf('bros-chat__bubble')).toBeGreaterThan(-1)
    expect(html.indexOf('bros-chat__bubble')).toBeLessThan(html.indexOf('bros-chat__meta'))
    expect(wrapper.find('[aria-label="Copy reply"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Copy message"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Edit message"]').exists()).toBe(true)
  })

  it('copies stored raw markdown for the assistant reply', async () => {
    const raw = '## Nuxt 3\n\n```bash\npnpm dlx nuxi@latest init app\n```\n'
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as {
      messages: Array<{ id: string; role: string; content: string; modelId?: string }>
    }
    vm.messages = [
      { id: 'u1', role: 'user', content: 'create a nuxt starter app' },
      { id: 'a1', role: 'assistant', content: raw, modelId: 'ollama/gemma3:12b' },
    ]
    await wrapper.vm.$nextTick()
    await wrapper.find('[aria-label="Copy reply"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith(raw)
  })

  it('edit+resend drops following turns then sends the edited text', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as {
      messages: Array<{ id: string; role: string; content: string }>
      resendFrom: (message: { id: string; role: string; content: string }, text: string) => Promise<void>
    }
    vm.messages = [
      { id: 'u1', role: 'user', content: 'first' },
      { id: 'a1', role: 'assistant', content: 'ok' },
      { id: 'u2', role: 'user', content: 'second' },
      { id: 'a2', role: 'assistant', content: 'later' },
    ]
    await vm.resendFrom(vm.messages[2]!, 'edited second').catch(() => {})
    const contents = vm.messages.map((m) => m.content)
    expect(contents).toEqual(['first', 'ok'])
    expect(contents).not.toContain('later')
    expect(contents).not.toContain('second')
  })

  it('pins the thread scroller to the bottom', async () => {
    const ChatPage = await import('../../src/app/pages/chat/[[id]].vue').then((m) => m.default)
    const wrapper = await mountSuspended(ChatPage, { route: '/chat' })
    const vm = wrapper.vm as unknown as {
      messages: Array<{ id: string; role: string; content: string }>
      scrollThread: () => void
    }
    vm.messages = [
      { id: 'u1', role: 'user', content: 'hello' },
      { id: 'a1', role: 'assistant', content: 'world' },
    ]
    await wrapper.vm.$nextTick()
    const thread = wrapper.find('.bros-chat__thread').element as HTMLElement
    Object.defineProperty(thread, 'scrollHeight', { configurable: true, get: () => 2400 })
    Object.defineProperty(thread, 'clientHeight', { configurable: true, get: () => 400 })
    thread.scrollTop = 0
    vm.scrollThread()
    expect(thread.scrollTop).toBe(2400)
  })
})
