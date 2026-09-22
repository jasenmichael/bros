import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { PROVIDER_PRESETS } from '../../src/server/utils/providerPresets'

const siteUrlById = Object.fromEntries(PROVIDER_PRESETS.map((p) => [p.id, p.siteUrl]))

mockNuxtImport('useFetch', () => {
  return (url?: string) => {
    if (String(url || '').includes('models/library')) {
      return {
        data: ref({
          gpu: { available: true, name: 'Test GPU', vramMb: 8192 },
          disk: { path: '/data', freeBytes: 100e9, totalBytes: 200e9 },
          useGpu: false,
          sections: {
            recommended: [{ name: 'gemma3:12b', label: 'gemma3:12b', source: 'ollama', sizeBytes: 8.1e9 }],
            ollama: [],
            huggingface: [],
            custom: [],
          },
        }),
        refresh: async () => {},
        pending: ref(false),
      }
    }
    if (String(url || '').includes('models/pull')) {
      return {
        data: ref({
          jobs: [
            {
              providerId: 'ollama',
              model: 'qwen2.5:0.5b',
              status: 'downloading',
              percent: 42,
              completed: 42e6,
              total: 100e6,
              error: null,
              phase: 'running',
              startedAt: 1,
            },
          ],
          activePulls: {
            ollama: [
              {
                providerId: 'ollama',
                model: 'qwen2.5:0.5b',
                status: 'downloading',
                percent: 42,
                completed: 42e6,
                total: 100e6,
                error: null,
                phase: 'running',
                startedAt: 1,
              },
            ],
          },
        }),
        refresh: async () => {},
        pending: ref(false),
      }
    }
    return {
      data: ref({
        providers: [
          { id: 'ollama', name: 'Ollama (core)', kind: 'ollama', baseUrl: 'http://ollama:11434', enabled: true, hasApiKey: false, config: {}, status: 'ready', statusLabel: 'Ready', port: 11435, models: [{ id: 'ollama/llama3.2', name: 'llama3.2', size: 2e9, enabled: true }] },
          { id: 'ollama-host', name: 'Ollama (host)', kind: 'ollama', baseUrl: 'http://host.docker.internal:11434', enabled: true, hasApiKey: false, config: { disabledModels: ['mistral'] }, status: 'unreachable', statusLabel: 'Unreachable', port: 11434, models: [{ id: 'ollama-host/mistral', name: 'mistral', size: 4e9, enabled: false }] },
          { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', enabled: false, hasApiKey: false, config: { models: ['gpt-4o-mini'] }, status: 'needs_key', statusLabel: 'Need an API key', popular: true, statusMessage: 'Need an API key', siteUrl: siteUrlById.openai },
          { id: 'gemini', name: 'Google Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', enabled: false, hasApiKey: false, config: {}, status: 'needs_key', statusLabel: 'Need an API key', popular: true, siteUrl: siteUrlById.gemini },
          { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', enabled: false, hasApiKey: false, config: {}, status: 'needs_key', statusLabel: 'Need an API key', popular: true, siteUrl: siteUrlById.groq, models: [{ name: 'openai/gpt-oss-120b', enabled: true }, { name: 'whisper-large-v3', enabled: true }] },
          { id: 'openrouter', name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', enabled: false, hasApiKey: false, config: {}, status: 'needs_key', statusLabel: 'Need an API key', popular: true, siteUrl: siteUrlById.openrouter },
          { id: 'anthropic', name: 'Anthropic', kind: 'openai', baseUrl: 'https://api.anthropic.com/v1', enabled: false, hasApiKey: false, config: {}, status: 'needs_key', statusLabel: 'Need an API key', popular: true, siteUrl: siteUrlById.anthropic },
          { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', enabled: false, hasApiKey: false, config: {}, status: 'needs_key', statusLabel: 'Need an API key', popular: true, siteUrl: siteUrlById.deepseek },
          { id: 'mistral', name: 'Mistral AI', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', enabled: false, hasApiKey: false, config: {}, status: 'needs_key', statusLabel: 'Need an API key', popular: true, siteUrl: siteUrlById.mistral },
          { id: 'xai', name: 'xAI', kind: 'openai', baseUrl: 'https://api.x.ai/v1', enabled: false, hasApiKey: false, config: {}, status: 'needs_key', statusLabel: 'Need an API key', popular: true, siteUrl: siteUrlById.xai },
          { id: 'together', name: 'Together AI', kind: 'openai', baseUrl: 'https://api.together.xyz/v1', enabled: false, hasApiKey: false, config: {}, status: 'needs_key', statusLabel: 'Need an API key', popular: true, siteUrl: siteUrlById.together },
          { id: 'fireworks', name: 'Fireworks AI', kind: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', enabled: false, hasApiKey: false, config: {}, status: 'needs_key', statusLabel: 'Need an API key', popular: true, siteUrl: siteUrlById.fireworks },
          { id: 'perplexity', name: 'Perplexity', kind: 'openai', baseUrl: 'https://api.perplexity.ai', enabled: false, hasApiKey: false, config: {}, status: 'needs_key', statusLabel: 'Need an API key', popular: true, siteUrl: siteUrlById.perplexity },
          { id: 'cohere', name: 'Cohere', kind: 'openai', baseUrl: 'https://api.cohere.ai/compatibility/v1', enabled: false, hasApiKey: false, config: {}, status: 'needs_key', statusLabel: 'Need an API key', popular: true, siteUrl: siteUrlById.cohere },
        ],
        activePulls: {},
        ollamaError: null,
        sidecarPublish: 11435,
        sidecarDns: 'http://ollama:11434',
        hostOllama: null,
      }),
      refresh: async () => {},
      pending: ref(false),
    }
  }
})

mockNuxtImport('useSeoMeta', () => () => {})

function headings(wrapper: { findAll: (sel: string) => { text: () => string }[] }) {
  return wrapper.findAll('h2').map((h) => h.text())
}

function visibleText(wrapper: { text: () => string }) {
  return `${wrapper.text()}\n${document.body.textContent || ''}`
}

describe('Providers page', () => {
  it('lists Ollama then Custom providers, with both Ollama cards collapsed on load', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    const titles = headings(wrapper)
    expect(titles).toContain('Ollama')
    expect(titles).toContain('Popular services')
    expect(titles).toContain('Custom providers')
    expect(titles.indexOf('Ollama')).toBeLessThan(titles.indexOf('Popular services'))
    expect(titles.indexOf('Popular services')).toBeLessThan(titles.indexOf('Custom providers'))
    expect(wrapper.text()).toContain('OpenAI')
    expect(wrapper.text()).toContain('Google Gemini')
    expect(wrapper.text()).toContain('Groq')
    expect(wrapper.text()).toContain('OpenRouter')
    expect(wrapper.text()).toContain('Anthropic')
    expect(wrapper.text()).toContain('DeepSeek')
    expect(wrapper.text()).toContain('Mistral AI')
    expect(wrapper.text()).toContain('xAI')
    expect(wrapper.text()).toContain('Together AI')
    expect(wrapper.text()).toContain('Fireworks AI')
    expect(wrapper.text()).toContain('Perplexity')
    expect(wrapper.text()).toContain('Cohere')
    expect(titles).not.toContain('Providers')
    expect(titles).not.toContain('Settings')
    expect(wrapper.text()).toContain('Ollama (core)')
    expect(wrapper.text()).toContain('127.0.0.1:11435')
    expect(wrapper.text()).toContain('Ollama (host port:11434)')
    expect(wrapper.text()).toContain('127.0.0.1:11434')
    expect(wrapper.text()).not.toContain('(ollama)')
    expect(wrapper.text()).not.toContain('(ollama-host)')
    expect(wrapper.text()).not.toContain('running :11435')
    expect(wrapper.text()).toContain('Add custom')
    expect(wrapper.text()).toContain('No custom providers yet.')
    expect(wrapper.text()).not.toContain('Sidecar DNS')
    expect(wrapper.text()).not.toContain('Paid providers')
    expect(wrapper.text()).not.toContain('External URL')
    expect(wrapper.text()).not.toContain('Pull')
    expect(wrapper.text()).not.toContain('user/name:tag')
    expect(wrapper.text()).not.toContain('Recommended stays')
    expect(wrapper.text()).not.toContain('llama3.2')
    expect(wrapper.text()).not.toContain('qwen2.5:0.5b')
    expect(wrapper.text()).not.toContain('ollama-host/mistral')
    expect(wrapper.find('[aria-label="Collapse models"]').exists()).toBe(false)
    expect(wrapper.findAll('[aria-label="Expand models"]').length).toBe(2)
    expect(wrapper.find('[aria-label="Enable Ollama (core) for chat"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Enable Ollama (host port:11434) for chat"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Enable OpenAI for chat"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Ready')
    expect(wrapper.text()).toContain('Unreachable')
    expect(wrapper.text()).toContain('Need an API key')
    expect(wrapper.text()).not.toMatch(/\brunning\b/)
    expect(wrapper.text()).not.toMatch(/\bstopped\b/)
    expect(wrapper.find('[aria-label="Enable OpenAI for chat"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[aria-label="Enable OpenRouter for chat"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[aria-label="Enable Ollama (core) for chat"]').attributes('disabled')).toBeUndefined()
    const pageText = wrapper.text()
    expect(pageText.indexOf('Popular services')).toBeLessThan(pageText.indexOf('Custom providers'))
    expect(wrapper.find('button[aria-label="Settings for Ollama (core)"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Settings for Ollama (host port:11434)"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Settings for OpenAI"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Expand OpenAI"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Copy http://127.0.0.1:11435/"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Copy http://127.0.0.1:11434/"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Open http://127.0.0.1:11435/"]').exists()).toBe(false)
    expect(wrapper.find('[href="http://127.0.0.1:11435/"]').exists()).toBe(false)
    expect(wrapper.find('[href="http://127.0.0.1:11434/"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Open https://api.openai.com/"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Open https://api.groq.com/"]').exists()).toBe(false)
    expect(wrapper.find('[href="https://api.openai.com/"]').exists()).toBe(false)
    expect(wrapper.find('[href="https://api.groq.com/"]').exists()).toBe(false)
    expect(wrapper.find('[href="https://generativelanguage.googleapis.com/"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Open OpenAI"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Open Groq"]').exists()).toBe(true)
    expect(wrapper.find(`[href="${siteUrlById.openai}"]`).exists()).toBe(true)
    expect(wrapper.find(`[href="${siteUrlById.groq}"]`).exists()).toBe(true)
    expect(wrapper.find('[aria-label="Copy https://api.openai.com/"]').exists()).toBe(true)
    expect(visibleText(wrapper)).not.toContain('Use GPU')
    expect(visibleText(wrapper)).not.toContain('GPU detected')
    const ollamaList = wrapper.findAll('ul').find((ul) => ul.text().includes('Ollama (core)'))
    const customList = wrapper.findAll('ul').find((ul) => ul.text().includes('No custom providers yet.'))
    expect(ollamaList?.classes()).toContain('w-full')
    expect(customList?.classes()).toContain('w-full')
  })

  it('expands then collapses the sidecar pull panel from the chevron without losing selection', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    const expanders = wrapper.findAll('[aria-label="Expand models"]')
    expect(expanders.length).toBe(2)
    await expanders[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('user/name:tag')
    expect(wrapper.text()).toContain('Pull')
    await wrapper.find('[aria-label="Collapse models"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('user/name:tag')
    expect(wrapper.text()).not.toContain('Pull')
    expect(wrapper.text()).toContain('Ollama (core)')
    expect(wrapper.text()).toContain('127.0.0.1:11435')
    expect(wrapper.find('[aria-label="Expand models"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Settings for Ollama (core)"]').exists()).toBe(false)
    expect(visibleText(wrapper)).not.toContain('Use GPU')
  })

  it('shows a Chat switch and ban delete on sidecar installed rows, with confirm', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    expect(wrapper.text()).not.toContain('llama3.2')
    await wrapper.findAll('[aria-label="Expand models"]')[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    const sidecarCard = wrapper.findAll('li').find((li) => li.text().includes('Ollama (core)'))
    expect(sidecarCard?.text()).toContain('llama3.2')
    expect(sidecarCard?.text()).toContain('2000 MB')
    expect(sidecarCard?.text()).not.toContain('Delete')
    expect(wrapper.find('[aria-label="Enable llama3.2 for chat"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Delete llama3.2"]').exists()).toBe(true)
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    await wrapper.find('[aria-label="Delete llama3.2"]').trigger('click')
    await wrapper.vm.$nextTick()
    const dialog = [...document.querySelectorAll('[role="dialog"]')]
      .find((el) => el.textContent?.includes('Are you sure?'))
    expect(dialog?.textContent).toContain('Delete llama3.2?')
    expect(dialog?.textContent).toContain('Are you sure?')
    const cancel = [...(dialog?.querySelectorAll('button') || [])].find((b) => b.textContent?.includes('Cancel'))
    expect(cancel).toBeTruthy()
    cancel!.click()
    await wrapper.vm.$nextTick()
    expect(document.querySelector('[role="dialog"][data-state="open"]')).toBeNull()
    expect(sidecarCard?.text()).toContain('llama3.2')
  })

  it('applies the same installed-row controls on the host card', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    const hostCard = wrapper.findAll('li').find((li) => li.text().includes('Ollama (host') && li.text().includes('Unreachable'))
    expect(hostCard).toBeTruthy()
    await hostCard!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(hostCard!.text()).toContain('mistral')
    expect(hostCard!.text()).not.toContain('Delete')
    expect(wrapper.find('[aria-label="Enable mistral for chat"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Delete mistral"]').exists()).toBe(true)
    await wrapper.find('[aria-label="Delete mistral"]').trigger('click')
    await wrapper.vm.$nextTick()
    const dialog = [...document.querySelectorAll('[role="dialog"]')]
      .find((el) => el.textContent?.includes('Delete mistral?'))
    expect(dialog?.textContent).toContain('Are you sure?')
    const cancel = [...(dialog?.querySelectorAll('button') || [])].find((b) => b.textContent?.includes('Cancel'))
    expect(cancel).toBeTruthy()
    cancel!.click()
    await wrapper.vm.$nextTick()
    expect(document.querySelector('[role="dialog"][data-state="open"]')).toBeNull()
  })

  it('moves pull into the host card when the host row is selected', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    const hostCard = wrapper.findAll('li').find((li) => li.text().includes('Ollama (host') && li.text().includes('Unreachable'))
    expect(hostCard).toBeTruthy()
    await hostCard!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(hostCard!.text()).toContain('Pull')
    expect(hostCard!.text()).toContain('host Ollama disk')
    expect(hostCard!.text()).toContain('OLLAMA_NOPRUNE=1')
    expect(hostCard!.text()).toContain('Host Ollama is unreachable')
    expect(hostCard!.text()).toContain('Save port')
    expect(hostCard!.text()).not.toContain('Use GPU')
    const sidecarCard = wrapper.findAll('li').find((li) => li.text().includes('Ollama (core)'))
    expect(sidecarCard?.text()).not.toContain('user/name:tag')
  })

  it('shows sidecar GPU settings after models, not in a modal', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    await wrapper.findAll('[aria-label="Expand models"]')[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    const sidecarCard = wrapper.findAll('li').find((li) => li.text().includes('Ollama (core)'))
    expect(sidecarCard?.text()).toContain('Use GPU')
    expect(sidecarCard?.text()).toContain('GPU detected')
    expect(sidecarCard?.text()).toContain('Sidecar publishes')
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    const hostCard = wrapper.findAll('li').find((li) => li.text().includes('Ollama (host') && li.text().includes('Unreachable'))
    expect(hostCard).toBeTruthy()
    await hostCard!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(hostCard!.text()).toContain('Save port')
    expect(hostCard!.text()).toContain('host Ollama disk')
    expect(hostCard!.text()).not.toContain('Use GPU')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('opens popular settings in the card dropdown after models, with no Delete', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    expect(wrapper.text()).not.toContain('gpt-4o-mini')
    await wrapper.find('[aria-label="Expand OpenAI"]').trigger('click')
    await wrapper.vm.$nextTick()
    const openaiCard = wrapper.findAll('li').find((li) => li.text().includes('OpenAI') && li.text().includes('Need an API key'))
    expect(openaiCard).toBeTruthy()
    expect(openaiCard!.text()).toContain('gpt-4o-mini')
    expect(openaiCard!.text()).toContain('Save')
    expect(openaiCard!.text()).not.toContain('Delete')
    expect(openaiCard!.text()).not.toContain('Use GPU')
    expect(openaiCard!.text()).not.toContain('Paid providers')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(wrapper.find('button[aria-label="Settings for OpenAI"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Enable gpt-4o-mini for chat"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Delete gpt-4o-mini"]').exists()).toBe(false)
  })

  it('shows a Chat switch and no delete on Groq catalog rows', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    await wrapper.find('[aria-label="Expand Groq"]').trigger('click')
    await wrapper.vm.$nextTick()
    const groqCard = wrapper.findAll('li').find((li) => li.text().includes('Groq') && li.text().includes('Need an API key'))
    expect(groqCard).toBeTruthy()
    expect(groqCard!.text()).toContain('openai/gpt-oss-120b')
    expect(groqCard!.text()).toContain('whisper-large-v3')
    expect(wrapper.find('[aria-label="Enable openai/gpt-oss-120b for chat"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Enable whisper-large-v3 for chat"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Delete openai/gpt-oss-120b"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Delete whisper-large-v3"]').exists()).toBe(false)
    expect(groqCard!.text()).not.toContain('Delete')
  })

  it('enables Pull for a typed owner/name:tag and keeps the catalog closed helper gone', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    await wrapper.findAll('[aria-label="Expand models"]')[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('Pull custom')
    const pullBtn = wrapper.findAll('button').find((b) => b.text() === 'Pull')
    expect(pullBtn).toBeTruthy()
    expect(pullBtn!.attributes('disabled')).toBeDefined()
    const input = wrapper.find('input[placeholder="Search Recommended / Ollama / Hugging Face"]')
    expect(input.exists()).toBe(true)
    await input.setValue('freehuntx/qwen3-coder:14b')
    await input.trigger('input')
    await wrapper.vm.$nextTick()
    const enabled = wrapper.findAll('button').find((b) => b.text() === 'Pull')
    expect(enabled!.attributes('disabled')).toBeUndefined()
    await input.setValue('bad;rm')
    await input.trigger('input')
    await wrapper.vm.$nextTick()
    const disabled = wrapper.findAll('button').find((b) => b.text() === 'Pull')
    expect(disabled!.attributes('disabled')).toBeDefined()
  })

  it('enables Pull after a catalog menu selection even when the display label has a size', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    await wrapper.findAll('[aria-label="Expand models"]')[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    const input = wrapper.find('input[placeholder="Search Recommended / Ollama / Hugging Face"]')
    expect(input.exists()).toBe(true)
    await input.setValue('gemma3:12b · 8.1 GB')
    await input.trigger('input')
    await wrapper.vm.$nextTick()
    const pullBtn = wrapper.findAll('button').find((b) => b.text() === 'Pull')
    expect(pullBtn!.attributes('disabled')).toBeUndefined()
    expect(pullBtn!.attributes('data-loading')).toBeUndefined()
  })

  it('shows in-list pull progress without a Chat switch', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    await wrapper.findAll('[aria-label="Expand models"]')[0]!.trigger('click')
    await wrapper.vm.$nextTick()
    const sidecarCard = wrapper.findAll('li').find((li) => li.text().includes('Ollama (core)'))
    expect(sidecarCard?.text()).toContain('qwen2.5:0.5b')
    expect(sidecarCard?.text()).toContain('42%')
    expect(sidecarCard?.text()).toContain('downloading')
    expect(sidecarCard?.text()).toContain('Stop')
    expect(wrapper.find('[aria-label="Enable qwen2.5:0.5b for chat"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Stop pull qwen2.5:0.5b"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Delete qwen2.5:0.5b"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Enable llama3.2 for chat"]').exists()).toBe(true)
  })

  it('opens a custom OpenAI-compat form from Add custom under Custom providers', async () => {
    const ModelsPage = await import('../../src/app/pages/providers/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    const add = wrapper.findAll('button').find((b) => b.text().includes('Add custom'))
    expect(add).toBeTruthy()
    await add!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(headings(wrapper)).toContain('Custom providers')
    const addDialog = [...document.querySelectorAll('[role="dialog"]')]
      .find((el) => el.textContent?.includes('Save provider'))
    expect(addDialog?.textContent).toContain('Save provider')
    expect(addDialog?.textContent).not.toContain('Anthropic')
    expect(addDialog?.textContent).not.toContain('Use GPU')
  })
})
