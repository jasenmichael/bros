import { describe, expect, it } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'

mockNuxtImport('useSeoMeta', () => () => {})

describe('docs layer pages', () => {
  it('renders the shared `/docs` index', async () => {
    const DocsIndex = await import('../../src/layers/docs/app/pages/docs/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(DocsIndex)
    expect(wrapper.text()).toContain('Documentation')
    expect(wrapper.text()).toContain('Getting started')
    expect(wrapper.text()).toContain('Install')
    expect(wrapper.text()).toContain('App')
    expect(wrapper.text()).toContain('Sidecars')
    expect(wrapper.text()).toContain('Development')
    expect(wrapper.text()).toContain('Popular services')
    expect(wrapper.text()).toContain('Configuration')
    expect(wrapper.text()).toContain('Custom providers')
    expect(wrapper.text()).toContain('Groq')
    expect(wrapper.text()).toContain('Ollama')
    expect(wrapper.get('[aria-label="Breadcrumb"]').text()).toContain('Docs')
  })
})
