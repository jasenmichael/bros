import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const { payload } = vi.hoisted(() => ({
  payload: {
    viaTunnel: false,
    errors: [] as string[],
    packages: [] as Array<Record<string, unknown>>,
    docker: [
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
        source: 'custom' as const,
        kind: 'custom' as const,
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
        source: 'https://github.com/org/dockerApps.git',
        kind: 'custom' as const,
        gitUrl: 'https://github.com/org/dockerApps.git',
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
mockNuxtImport('useRoute', () => () => ({ query: {} }))
mockNuxtImport('useRouter', () => () => ({
  replace: async () => {},
  push: async () => {},
  afterEach: () => () => {},
  beforeEach: () => () => {},
  beforeResolve: () => () => {},
}))
mockNuxtImport('usePinnedNav', () => () => ({ refreshPinnedNav: async () => {} }))

describe('DockerApps addon section', () => {
  it('lists every kind in one filtered grid with kind in the heading', async () => {
    const AppsPage = await import('../../app/ui/pages/apps/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(AppsPage)

    expect(wrapper.text()).toContain('Core')
    expect(wrapper.text()).toContain('Addon')
    expect(wrapper.text()).toContain('Custom')
    expect(wrapper.text()).toContain('Add app')
    expect(wrapper.text()).toContain('From a repo')
    expect(wrapper.text()).not.toContain('Bros dockerApp on')

    const grid = wrapper.find('[data-app-section="list"]')
    expect(grid.attributes('data-app-grid')).toBe('multi')
    expect(wrapper.findAll('[data-app-section="custom"]')).toHaveLength(0)

    const heading = (id: string) => wrapper.find(`[data-app-card="${id}"] h3`).text()
    expect(heading('ollama')).toBe('Ollama (core)')
    expect(heading('opencode')).toBe('OpenCode (addon)')
    expect(heading('openwebui')).toBe('Open WebUI (addon)')
    expect(heading('my-pack')).toBe('My pack (custom)')
    expect(heading('cloned')).toBe('Cloned pack (repo)')
    expect(wrapper.find('[data-app-src]').exists()).toBe(false)

    expect(wrapper.find('[data-app-card="ollama"]').attributes('data-card-layout')).toBe('compact')
    expect(wrapper.find('[data-app-card="opencode"]').attributes('data-card-layout')).toBe('compact')
    expect(wrapper.find('[data-app-card="my-pack"]').attributes('data-card-layout')).toBe('compact')
  })

  it('uses the same segmented control for run state, interface type, and kind', async () => {
    payload.docker[1]!.interfaces = [{ type: 'webui', service: 'opencode' }]
    const AppsPage = await import('../../app/ui/pages/apps/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(AppsPage)

    const groupClass = ['flex', 'rounded-lg', 'border', 'p-0.5']
    const state = wrapper.get('[aria-label="Run state"]')
    const type = wrapper.get('[aria-label="Interface type"]')
    const kind = wrapper.get('[aria-label="App kind"]')
    for (const group of [state, type, kind]) {
      expect(group.attributes('role')).toBe('group')
      expect(group.classes()).toEqual(expect.arrayContaining(groupClass))
      expect(group.find('[role="tab"]').exists()).toBe(false)
      expect(group.findAll('button').every((btn) => btn.attributes('aria-pressed') != null)).toBe(true)
    }
    expect(state.classes()).toEqual(type.classes())
    expect(type.classes()).toEqual(kind.classes())
    expect(kind.classes()).toContain('w-fit')

    const filters = wrapper.get('[data-app-filters]')
    expect(filters.element.contains(state.element)).toBe(true)
    expect(filters.element.contains(type.element)).toBe(true)
    expect(filters.element.contains(kind.element)).toBe(true)
    expect(filters.text()).not.toContain('Add app')
    expect(filters.text()).not.toContain('From a repo')
    const add = wrapper.findAll('button').find((btn) => btn.text() === 'Add app')!
    expect(add.element.compareDocumentPosition(filters.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const card = wrapper.get('[data-app-card="opencode"]')
    const actions = card.get('[data-app-actions]')
    const toggles = card.get('[data-app-toggles]')
    const details = card.get('[data-app-details]')
    expect(actions.classes()).not.toContain('justify-end')
    expect(actions.classes()).toContain('items-center')
    expect(actions.text()).toContain('Start')
    expect(actions.text()).toContain('Stop')
    expect(actions.text()).toContain('Restart')
    expect(actions.text()).toContain('Logs')
    expect(actions.text()).not.toContain('Autostart')
    expect(actions.text()).not.toContain('Pin in nav')
    const chevron = actions.get('[aria-label="Show app details"]')
    expect(chevron.classes()).toContain('ml-auto')
    expect(chevron.element).toBe(actions.element.lastElementChild)
    const start = actions.findAll('button').find((btn) => btn.text() === 'Start')
    expect(start!.classes()).not.toContain('ml-auto')
    expect(toggles.text()).toContain('Autostart')
    expect(actions.element.compareDocumentPosition(toggles.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(details.element.contains(actions.element)).toBe(false)
    expect(details.element.contains(toggles.element)).toBe(false)
    expect(details.text()).not.toContain('Start')

    const press = async (group: typeof state, label: string) => {
      const btn = group.findAll('button').find((item) => item.text() === label)
      expect(btn).toBeTruthy()
      await btn!.trigger('click')
    }
    const ids = () => wrapper.findAll('[data-app-card]').map((card) => card.attributes('data-app-card'))

    await press(state, 'Stopped')
    expect(ids()).toEqual(['my-pack', 'cloned'])
    await press(state, 'All')

    await press(type, 'webui')
    expect(ids()).toEqual(['opencode'])
    await press(type, 'All')

    await press(kind, 'Addon')
    expect(ids()).toEqual(['opencode', 'openwebui'])
    await press(kind, 'Custom')
    expect(ids()).toEqual(['my-pack', 'cloned'])
    await press(kind, 'Core')
    expect(ids()).toEqual(['ollama'])
  })

  it('filters package apps by manager and renders them on the same card', async () => {
    const saved = payload.packages.map((row) => ({ ...row }))
    payload.packages = [
      {
        id: 'bun',
        name: 'bun',
        kind: 'nix',
        tier: 'core',
        enabled: true,
        interfaces: [],
      },
      {
        id: 'paperclip',
        name: 'Paperclip',
        kind: 'npm',
        tier: 'addon',
        enabled: true,
        services: [{ command: 'paperclipai run' }],
        serviceRunning: true,
        interfaces: [{ type: 'webui', publish: 3100 }],
      },
    ]
    try {
      const AppsPage = await import('../../app/ui/pages/apps/index.vue').then((m) => m.default)
      const wrapper = await mountSuspended(AppsPage)
      const manager = wrapper.get('[aria-label="Package manager"]')
      expect(manager.text()).toContain('docker')
      expect(manager.text()).toContain('npm')
      expect(manager.text()).toContain('nix')
      expect(wrapper.get('[data-app-section="list"]').exists()).toBe(true)
      expect(wrapper.get('[data-app-section="nix"]').exists()).toBe(true)
      expect(wrapper.get('[data-app-section="npm"]').exists()).toBe(true)
      const bun = wrapper.get('[data-app-card="bun"]')
      expect(bun.text()).toContain('bun (core)')
      expect(bun.text()).toContain('Check')
      expect(bun.text()).not.toContain('Start')
      expect(bun.text()).not.toContain('Desktop settings')
      const paperclip = wrapper.get('[data-app-card="paperclip"]')
      expect(paperclip.get('[data-app-actions]').text()).toContain('Start')
      expect(paperclip.get('[data-app-actions]').text()).toContain('Stop')
      expect(paperclip.get('[data-app-actions]').text()).toContain('Restart')
      expect(paperclip.text()).not.toContain('Desktop settings')
      const press = async (label: string) => {
        const btn = manager.findAll('button').find((item) => item.text() === label)
        expect(btn).toBeTruthy()
        await btn!.trigger('click')
      }
      await press('nix')
      expect(wrapper.find('[data-app-card="bun"]').exists()).toBe(true)
      expect(wrapper.find('[data-app-card="paperclip"]').exists()).toBe(false)
      expect(wrapper.find('[data-app-card="ollama"]').exists()).toBe(false)
      await press('docker')
      expect(wrapper.find('[data-app-card="ollama"]').exists()).toBe(true)
      expect(wrapper.find('[data-app-card="bun"]').exists()).toBe(false)
    } finally {
      payload.packages = saved
    }
  })

  it('shows Logs on every card and leaves gui without Open', async () => {
    const saved = payload.docker.map((row) => ({ ...row }))
    payload.docker = [
      ...saved,
      {
        id: 'cursor',
        name: 'Cursor',
        description: 'Desktop',
        source: 'shipped' as const,
        kind: 'addon' as const,
        packageSlug: 'cursor',
        interfaces: [{ type: 'gui', command: 'cursor' }],
        settings: { autostart: false, navPinned: false, hostMode: 'auto' as const },
        status: { running: false, services: [] },
        hasContainer: false,
      },
      {
        id: 'pi',
        name: 'Pi',
        description: 'Agent',
        source: 'shipped' as const,
        kind: 'addon' as const,
        packageSlug: 'pi',
        interfaces: [{ type: 'cli', bin: 'pi' }],
        settings: { autostart: false, navPinned: false, hostMode: 'auto' as const },
        status: { running: false, services: [] },
        hasContainer: false,
      },
    ]
    try {
      const AppsPage = await import('../../app/ui/pages/apps/index.vue').then((m) => m.default)
      const wrapper = await mountSuspended(AppsPage)
      for (const id of ['ollama', 'opencode', 'my-pack', 'cursor', 'pi']) {
        const actions = wrapper.get(`[data-app-card="${id}"] [data-app-actions]`)
        expect(actions.text()).toContain('Logs')
        expect(actions.html()).toContain(`/apps/${id}/logs`)
      }
      const cursor = wrapper.get('[data-app-card="cursor"] [data-app-actions]')
      expect(cursor.text()).not.toContain('Open Cursor')
      expect(wrapper.get('[data-app-card="pi"] [data-app-actions]').text()).not.toContain('Open Pi')
    } finally {
      payload.docker = saved
    }
  })
})
