import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const { payload } = vi.hoisted(() => ({
  payload: {
    viaTunnel: true,
    errors: [] as string[],
    sidecars: [
      {
        id: 'ollama',
        name: 'Ollama',
        description: 'Models',
        source: 'core' as const,
        packageSlug: 'ollama',
        interfaces: [],
        settings: { autostart: false, navPinned: false, hostMode: 'auto' as const },
        status: { running: true, services: [] },
        hasContainer: true,
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

describe('Sidecars via-tunnel lock', () => {
  it('does not list cloudflared as a sidecar and leaves other sidecars stoppable', async () => {
    payload.viaTunnel = true
    const SidecarsPage = await import('../../src/app/pages/sidecars/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SidecarsPage)
    expect(wrapper.text()).not.toContain('cloudflared')
    expect(wrapper.text()).not.toContain('Stop locked: this session is through the tunnel.')

    const stops = wrapper.findAll('button').filter((b) => b.text() === 'Stop')
    expect(stops).toHaveLength(1)
    expect((stops[0].element as HTMLButtonElement).disabled).toBe(false)
  })
})
