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
    expect(wrapper.text()).toContain('Pull')
    expect(wrapper.text()).toContain('owner/name:tag')
  })
})
