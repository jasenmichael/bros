import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const { payload } = vi.hoisted(() => ({
  payload: {
    viaTunnel: false,
    errors: [] as string[],
    sidecars: [
      {
        id: 'ollama',
        name: 'Ollama',
        description: 'Models',
        source: 'shipped' as const,
        kind: 'core' as const,
        packageSlug: 'ollama',
        interfaces: [] as Array<{ type: string; service: string }>,
        settings: { autostart: true, navPinned: false, hostMode: 'auto' as const },
        status: { running: true, services: [] },
        hasContainer: true,
      },
      {
        id: 'opencode',
        name: 'OpenCode',
        description: 'Code',
        source: 'shipped' as const,
        kind: 'addon' as const,
        packageSlug: 'opencode',
        interfaces: [],
        settings: { autostart: false, navPinned: false, hostMode: 'auto' as const },
        status: { running: true, services: [] },
        hasContainer: true,
      },
      {
        id: 'openwebui',
        name: 'Open WebUI',
        description: 'Chat',
        source: 'shipped' as const,
        kind: 'addon' as const,
        packageSlug: 'openwebui',
        interfaces: [],
        settings: { autostart: false, navPinned: false, hostMode: 'auto' as const },
        status: { running: true, services: [] },
        hasContainer: true,
      },
      {
        id: 'my-pack',
        name: 'My pack',
        description: 'Data dir pack',
        source: 'data dir' as const,
        kind: 'additional' as const,
        packageSlug: 'my-pack',
        editable: true,
        interfaces: [],
        settings: { autostart: false, navPinned: false, hostMode: 'auto' as const },
        status: { running: false, services: [] },
        hasContainer: false,
      },
      {
        id: 'cloned',
        name: 'Cloned pack',
        description: 'Git pack',
        source: 'https://github.com/org/sidecars.git',
        kind: 'additional' as const,
        gitUrl: 'https://github.com/org/sidecars.git',
        packageSlug: 'cloned',
        interfaces: [],
        settings: { autostart: false, navPinned: false, hostMode: 'auto' as const },
        status: { running: false, services: [] },
        hasContainer: false,
      },
    ],
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

describe('Sidecars addon section', () => {
  it('lists Core then one Addon sidecars section with bros/repo/custom badges', async () => {
    const SidecarsPage = await import('../../src/app/pages/sidecars/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SidecarsPage)

    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual(['Core', 'Addon sidecars'])
    expect(wrapper.text()).toContain('Add sidecar')
    expect(wrapper.text()).toContain('From a repo')

    const coreGrid = wrapper.find('[data-sidecar-section="core"]')
    const addonGrid = wrapper.find('[data-sidecar-section="addon"]')
    expect(coreGrid.attributes('data-sidecar-grid')).toBe('single')
    expect(addonGrid.attributes('data-sidecar-grid')).toBe('multi')
    expect(wrapper.findAll('[data-sidecar-section="additional"]')).toHaveLength(0)

    const src = (id: string) => wrapper.find(`[data-sidecar-card="${id}"] [data-sidecar-src]`).attributes('data-sidecar-src')
    expect(src('ollama')).toBe('bros')
    expect(src('opencode')).toBe('bros')
    expect(src('openwebui')).toBe('bros')
    expect(src('my-pack')).toBe('custom')
    expect(src('cloned')).toBe('repo')

    expect(wrapper.find('[data-sidecar-card="ollama"]').attributes('data-card-layout')).toBe('wide')
    expect(wrapper.find('[data-sidecar-card="opencode"]').attributes('data-card-layout')).toBe('compact-lg')
    expect(wrapper.find('[data-sidecar-card="my-pack"]').attributes('data-card-layout')).toBe('compact-lg')
  })
})
