import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

mockNuxtImport('useFetch', () => {
  return () => ({
    data: ref({
      providers: [{ id: 'ollama', name: 'Ollama', kind: 'ollama', baseUrl: 'http://ollama:11434', enabled: true, hasApiKey: false, config: { mode: 'sidecar' } }],
      ollamaModels: [],
      ollamaError: null,
      ollamaBaseUrl: 'http://ollama:11434',
      ollamaSource: 'sidecar',
      sidecarPublish: 11435,
      sidecarDns: 'http://ollama:11434',
      hostOllama: null,
    }),
    refresh: async () => {},
    pending: ref(false),
  })
})

mockNuxtImport('useSeoMeta', () => () => {})

describe('Models page', () => {
  it('shows Ollama section and Pull control', async () => {
    const ModelsPage = await import('../../src/app/pages/models/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ModelsPage)
    expect(wrapper.text()).toContain('Ollama')
    expect(wrapper.text()).toContain('Host')
    expect(wrapper.text()).toContain('Sidecar DNS')
    expect(wrapper.text()).not.toContain('External URL')
    expect(wrapper.text()).not.toContain('Save URL')
    expect(wrapper.text()).toContain('Pull')
    expect(wrapper.text()).toContain('user/name:tag')
  })
})
