import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

function dockerApp(partial: {
  id: string
  name: string
  kind: 'core' | 'addon' | 'custom'
  source?: string
  interfaces?: Array<{ type: string; bin?: string; command?: string; service?: string }>
  cli?: Array<{ bin: string; hostInstalled: boolean; source: 'host' | 'docker' | 'none' }>
  settings?: { autostart: boolean; navPinned: boolean; hostMode?: string; exposeHost?: boolean }
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
    docker: [] as Array<Record<string, unknown>>,
    packages: [] as Array<Record<string, unknown>>,
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

describe('DockerApp card layout', () => {
  it('uses the compact two-up grid when the list has two or more cards', async () => {
    payload.docker = [
      dockerApp({ id: 'ollama', name: 'Ollama', kind: 'core' }),
      dockerApp({ id: 'opencode', name: 'OpenCode', kind: 'addon' }),
      dockerApp({ id: 'openwebui', name: 'Open WebUI', kind: 'addon' }),
      dockerApp({ id: 'extra', name: 'Extra', kind: 'custom', source: 'custom' }),
    ]

    const AppsPage = await import('../../src/ui/pages/apps/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(AppsPage)

    const grid = wrapper.find('[data-app-section="list"]')

    expect(grid.attributes('data-app-grid')).toBe('multi')
    expect(grid.classes()).toContain('@3xl/dockerApp:grid-cols-2')
    expect(grid.classes()).not.toContain('lg:grid-cols-2')
    expect(wrapper.find('[data-app-card="ollama"]').attributes('data-card-layout')).toBe('compact')
    expect(wrapper.find('[data-app-card="opencode"]').attributes('data-card-layout')).toBe('compact')
    expect(wrapper.find('[data-app-card="openwebui"]').attributes('data-card-layout')).toBe('compact')
    expect(wrapper.find('[data-app-card="extra"]').attributes('data-card-layout')).toBe('compact')
  })

  it('uses the compact grid when core and addon share one list', async () => {
    payload.docker = [
      dockerApp({ id: 'ollama', name: 'Ollama', kind: 'core' }),
      dockerApp({ id: 'opencode', name: 'OpenCode', kind: 'addon' }),
    ]

    const AppsPage = await import('../../src/ui/pages/apps/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(AppsPage)

    expect(wrapper.find('[data-app-section="list"]').attributes('data-app-grid')).toBe('multi')
    expect(wrapper.find('[data-app-card="opencode"]').attributes('data-card-layout')).toBe('compact')
  })

  it('shows the CLI source and no host expose switch', async () => {
    const AppsPage = await import('../../src/ui/pages/apps/index.vue').then((m) => m.default)
    payload.docker = [
      dockerApp({
        id: 'cursor',
        name: 'Cursor',
        kind: 'addon',
        interfaces: [{ type: 'cli', service: 'cursor', bin: 'agent', command: '/home/bros/.local/bin/agent' }],
        cli: [{ bin: 'agent', hostInstalled: false, source: 'docker' }],
        settings: { autostart: true, navPinned: false, exposeHost: true },
      }),
    ]
    const missing = await mountSuspended(AppsPage)
    expect(missing.text()).not.toContain('Use in Bros')
    expect(missing.text()).not.toContain('Expose to host')
    expect(missing.text()).toContain('agent: Bros uses docker')

    payload.docker = [
      dockerApp({
        id: 'cursor',
        name: 'Cursor',
        kind: 'addon',
        interfaces: [{ type: 'cli', service: 'cursor', bin: 'agent', command: '/home/bros/.local/bin/agent' }],
        cli: [{ bin: 'agent', hostInstalled: true, source: 'host' }],
        settings: { autostart: true, navPinned: false, exposeHost: true },
      }),
    ]
    const installed = await mountSuspended(AppsPage)
    expect(installed.text()).not.toContain('Use in Bros')
    expect(installed.text()).not.toContain('Expose to host')
    expect(installed.text()).toContain('agent: Bros uses host')
  })

  it('lists cursor cli bins under cli and only the gui command under gui', async () => {
    payload.docker = [
      dockerApp({ id: 'ollama', name: 'Ollama', kind: 'core' }),
      dockerApp({
        id: 'cursor',
        name: 'Cursor',
        kind: 'addon',
        interfaces: [
          { type: 'cli', service: 'cursor', bin: 'agent', command: '/home/bros/.local/bin/agent' },
          { type: 'cli', service: 'cursor', bin: 'cursor-agent', command: '/home/bros/.local/bin/agent' },
          { type: 'cli', service: 'cursor', bin: 'cursor', command: '/usr/bin/cursor' },
          { type: 'cli', service: 'cursor', bin: 'cursor-tunnel', command: '/usr/share/cursor/bin/cursor-tunnel' },
          { type: 'gui', service: 'cursor', command: 'cursor' },
        ],
      }),
      dockerApp({
        id: 'pi',
        name: 'Pi',
        kind: 'addon',
        interfaces: [{ type: 'cli', bin: 'pi', command: 'pi' }],
      }),
    ]

    const AppsPage = await import('../../src/ui/pages/apps/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(AppsPage)
    const card = wrapper.find('[data-app-card="cursor"][data-card-layout="compact"]')
    const cli = card.find('[data-card-block="cli"]')
    const gui = card.find('[data-card-block="gui"]')

    expect(card.exists()).toBe(true)
    expect(cli.text()).toContain('agent')
    expect(cli.text()).toContain('cursor-agent')
    expect(cli.text()).toContain('cursor')
    expect(cli.text()).toContain('cursor-tunnel')
    expect(gui.text()).toContain('cursor')
    expect(gui.text()).not.toContain('agent')
    expect(gui.text()).not.toContain('cursor-agent')
    expect(gui.text()).not.toContain('cursor-tunnel')
  })
})
