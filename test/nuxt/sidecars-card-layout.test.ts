import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

function sidecar(partial: {
  id: string
  name: string
  kind: 'core' | 'addon' | 'additional'
  source?: string
}) {
  return {
    description: partial.name,
    source: partial.source ?? 'shipped',
    packageSlug: partial.id,
    interfaces: [] as Array<{ type: string; service: string }>,
    settings: { autostart: true, navPinned: false, hostMode: 'auto' as const },
    status: { running: true, services: [] as Array<{ name: string; state: string }> },
    hasContainer: true,
    ...partial,
  }
}

const { payload } = vi.hoisted(() => ({
  payload: {
    viaTunnel: false,
    errors: [] as string[],
    sidecars: [] as Array<Record<string, unknown>>,
  },
}))

mockNuxtImport('useFetch', () => {
  return () => ({
    data: ref(payload),
    refresh: async () => {},
    pending: ref(false),
  })
})

mockNuxtImport('useSeoMeta', () => () => {})
mockNuxtImport('usePinnedNav', () => () => ({ refreshPinnedNav: async () => {} }))

describe('Sidecar card layout', () => {
  it('uses a wide card when a section has one item and compact two-up when it has two', async () => {
    payload.sidecars = [
      sidecar({ id: 'ollama', name: 'Ollama', kind: 'core' }),
      sidecar({ id: 'opencode', name: 'OpenCode', kind: 'addon' }),
      sidecar({ id: 'openwebui', name: 'Open WebUI', kind: 'addon' }),
      sidecar({ id: 'extra', name: 'Extra', kind: 'additional', source: 'custom' }),
    ]

    const SidecarsPage = await import('../../src/app/pages/sidecars/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SidecarsPage)

    const core = wrapper.find('[data-sidecar-section="core"]')
    const addon = wrapper.find('[data-sidecar-section="addon"]')
    const additional = wrapper.find('[data-sidecar-section="additional"]')

    expect(core.attributes('data-sidecar-grid')).toBe('single')
    expect(core.classes()).toContain('grid-cols-1')
    expect(core.classes()).not.toContain('lg:grid-cols-2')
    expect(wrapper.find('[data-sidecar-card="ollama"]').attributes('data-card-layout')).toBe('wide')

    expect(addon.attributes('data-sidecar-grid')).toBe('multi')
    expect(addon.classes()).toContain('lg:grid-cols-2')
    expect(wrapper.find('[data-sidecar-card="opencode"]').attributes('data-card-layout')).toBe('compact-lg')
    expect(wrapper.find('[data-sidecar-card="openwebui"]').attributes('data-card-layout')).toBe('compact-lg')

    expect(additional.attributes('data-sidecar-grid')).toBe('single')
    expect(additional.classes()).toContain('grid-cols-1')
    expect(additional.classes()).not.toContain('lg:grid-cols-2')
    expect(wrapper.find('[data-sidecar-card="extra"]').attributes('data-card-layout')).toBe('wide')
  })

  it('treats a lone addon as wide, same as Core', async () => {
    payload.sidecars = [
      sidecar({ id: 'ollama', name: 'Ollama', kind: 'core' }),
      sidecar({ id: 'opencode', name: 'OpenCode', kind: 'addon' }),
    ]

    const SidecarsPage = await import('../../src/app/pages/sidecars/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SidecarsPage)

    expect(wrapper.find('[data-sidecar-section="addon"]').attributes('data-sidecar-grid')).toBe('single')
    expect(wrapper.find('[data-sidecar-card="opencode"]').attributes('data-card-layout')).toBe('wide')
  })
})
