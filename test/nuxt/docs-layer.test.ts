import { describe, expect, it } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'

mockNuxtImport('useSeoMeta', () => () => {})

describe('docs layer pages', () => {
  it('renders the shared `/docs` index', async () => {
    const DocsIndex = await import('../../src/layers/docs/app/pages/docs/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(DocsIndex)
    expect(wrapper.text()).toContain('Documentation')
    expect(wrapper.text()).toContain('Getting started')
    expect(wrapper.text()).toContain('Sidecars')
    expect(wrapper.text()).toContain('Configuration')
  })
})
