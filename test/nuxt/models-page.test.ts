import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

mockNuxtImport('useFetch', () => {
  return (url?: string) => {
    if (String(url || '').includes('/api/models/ollama/library')) {
      return {
        data: ref({
          gpu: { available: true, name: 'Test GPU', vramMb: 8192 },
          disk: { path: '/data', freeBytes: 100e9, totalBytes: 200e9 },
          useGpu: false,
          sections: { recommended: [], ollama: [], huggingface: [], custom: [] },
        }),
        refresh: async () => {},
        pending: ref(false),
      }
    }
    return {
      data: ref({
        providers: [
          { id: 'ollama', name: 'Ollama sidecar', kind: 'ollama', baseUrl: 'http://ollama:11434', enabled: true, hasApiKey: false, config: {}, status: 'running', port: 11435 },
          { id: 'ollama-host', name: 'Ollama host', kind: 'ollama', baseUrl: 'http://host.docker.internal:11434', enabled: true, hasApiKey: false, config: {}, status: 'stopped', port: null },
        ],
        ollamaModelsByProvider: { ollama: [], 'ollama-host': [] },
        openaiModelsByProvider: {},
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

describe('Models page', () => {
  it('lists Ollama then Custom providers, with pull inside the selected sidecar card', async () => {
    const ModelsPage = await import('../../src/app/pages/models/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    const titles = headings(wrapper)
    expect(titles).toContain('Ollama')
    expect(titles).toContain('Custom providers')
    expect(titles).not.toContain('Providers')
    expect(titles).not.toContain('Settings')
    expect(wrapper.text()).toContain('Ollama sidecar')
    expect(wrapper.text()).toContain('127.0.0.1:11435')
    expect(wrapper.text()).toContain('Ollama host')
    expect(wrapper.text()).toContain('127.0.0.1:11434')
    expect(wrapper.text()).not.toContain('(ollama)')
    expect(wrapper.text()).not.toContain('(ollama-host)')
    expect(wrapper.text()).not.toContain('running :11435')
    expect(wrapper.text()).toContain('Add custom')
    expect(wrapper.text()).toContain('No custom providers yet.')
    expect(wrapper.text()).not.toContain('Sidecar DNS')
    expect(wrapper.text()).not.toContain('Paid providers')
    expect(wrapper.text()).not.toContain('External URL')
    expect(wrapper.text()).toContain('Pull')
    expect(wrapper.text()).toContain('user/name:tag')
    const pageText = wrapper.text()
    expect(pageText.indexOf('Pull')).toBeGreaterThan(-1)
    expect(pageText.indexOf('Pull')).toBeLessThan(pageText.indexOf('Custom providers'))
    expect(wrapper.find('button[aria-label="Settings for Ollama sidecar"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Settings for Ollama host"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Copy http://127.0.0.1:11435/"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Copy http://127.0.0.1:11434/"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Open http://127.0.0.1:11435/"]').exists()).toBe(true)
    expect(wrapper.find('[href="http://127.0.0.1:11435/"]').exists()).toBe(true)
    expect(wrapper.find('[href="http://127.0.0.1:11434/"]').exists()).toBe(true)
    expect(visibleText(wrapper)).not.toContain('Use GPU')
    expect(visibleText(wrapper)).not.toContain('GPU detected')
    expect(wrapper.find('[aria-label="Collapse models"]').exists()).toBe(true)
    const ollamaList = wrapper.findAll('ul').find((ul) => ul.text().includes('Ollama sidecar'))
    const customList = wrapper.findAll('ul').find((ul) => ul.text().includes('No custom providers yet.'))
    expect(ollamaList?.classes()).toContain('w-full')
    expect(customList?.classes()).toContain('w-full')
  })

  it('collapses the sidecar pull panel from the chevron without losing selection', async () => {
    const ModelsPage = await import('../../src/app/pages/models/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    expect(wrapper.text()).toContain('user/name:tag')
    await wrapper.find('[aria-label="Collapse models"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('user/name:tag')
    expect(wrapper.text()).not.toContain('Pull')
    expect(wrapper.text()).toContain('Ollama sidecar')
    expect(wrapper.text()).toContain('127.0.0.1:11435')
    expect(wrapper.find('[aria-label="Expand models"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Settings for Ollama sidecar"]').exists()).toBe(true)
  })

  it('moves pull into the host card when the host row is selected', async () => {
    const ModelsPage = await import('../../src/app/pages/models/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    const hostCard = wrapper.findAll('li').find((li) => li.text().includes('Ollama host') && li.text().includes('stopped'))
    expect(hostCard).toBeTruthy()
    await hostCard!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(hostCard!.text()).toContain('Pull')
    expect(hostCard!.text()).toContain('host Ollama disk')
    expect(hostCard!.text()).toContain('Host Ollama is stopped')
    const sidecarCard = wrapper.findAll('li').find((li) => li.text().includes('Ollama sidecar'))
    expect(sidecarCard?.text()).not.toContain('user/name:tag')
  })

  it('opens sidecar settings modal with GPU, not host', async () => {
    const ModelsPage = await import('../../src/app/pages/models/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    await wrapper.find('button[aria-label="Settings for Ollama sidecar"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(visibleText(wrapper)).toContain('Use GPU')
    expect(visibleText(wrapper)).toContain('GPU detected')
    expect(visibleText(wrapper)).toContain('Sidecar publishes')

    await wrapper.find('button[aria-label="Settings for Ollama host"]').trigger('click')
    await wrapper.vm.$nextTick()
    const hostText = document.querySelector('[role="dialog"]')?.textContent || ''
    expect(hostText).toContain('Save port')
    expect(hostText).toContain('host Ollama disk')
    expect(hostText).not.toContain('Use GPU')
  })

  it('opens a custom OpenAI-compat form from Add custom under Custom providers', async () => {
    const ModelsPage = await import('../../src/app/pages/models/index.vue').then((m) => m.default)
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
