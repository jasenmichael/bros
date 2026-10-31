import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const { payload } = vi.hoisted(() => ({
  payload: {
    viaTunnel: true,
    errors: [] as string[],
    packages: [] as Array<Record<string, unknown>>,
    docker: [
      {
        id: 'opencode',
        name: 'OpenCode',
        description: 'Code',
        source: 'shipped' as const,
        kind: 'addon' as const,
        packageSlug: 'opencode',
        interfaces: [],
        settings: { autostart: false, navPinned: false },
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
mockNuxtImport('useRoute', () => () => ({ query: {} }))
mockNuxtImport('useRouter', () => () => ({
  replace: async () => {},
  push: async () => {},
  afterEach: () => () => {},
  beforeEach: () => () => {},
  beforeResolve: () => () => {},
}))
mockNuxtImport('usePinnedNav', () => () => ({ refreshPinnedNav: async () => {} }))

describe('DockerApps via-tunnel lock', () => {
  it('does not list cloudflared as a dockerApp and leaves other dockerApps stoppable', async () => {
    payload.viaTunnel = true
    const AppsPage = await import('../../app/ui/components/SettingsDesktopApps.vue').then((m) => m.default)
    const wrapper = await mountSuspended(AppsPage)
    expect(wrapper.text()).not.toContain('cloudflared')
    expect(wrapper.text()).not.toContain('Stop locked: this session is through the tunnel.')

    const stops = wrapper.findAll('button').filter((b) => b.text() === 'Stop')
    expect(stops).toHaveLength(1)
    expect((stops[0].element as HTMLButtonElement).disabled).toBe(false)
  })
})
