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
        source: 'custom' as const,
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
  it('lists every kind in one filtered grid with kind in the heading', async () => {
    const SidecarsPage = await import('../../src/ui/pages/sidecars/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SidecarsPage)

    expect(wrapper.text()).toContain('Core')
    expect(wrapper.text()).toContain('Addon')
    expect(wrapper.text()).toContain('Custom')
    expect(wrapper.text()).toContain('Add sidecar')
    expect(wrapper.text()).toContain('From a repo')
    expect(wrapper.text()).not.toContain('Bros sidecar on')

    const grid = wrapper.find('[data-sidecar-section="list"]')
    expect(grid.attributes('data-sidecar-grid')).toBe('multi')
    expect(wrapper.findAll('[data-sidecar-section="additional"]')).toHaveLength(0)

    const heading = (id: string) => wrapper.find(`[data-sidecar-card="${id}"] h3`).text()
    expect(heading('ollama')).toBe('Ollama (core)')
    expect(heading('opencode')).toBe('OpenCode (addon)')
    expect(heading('openwebui')).toBe('Open WebUI (addon)')
    expect(heading('my-pack')).toBe('My pack (custom)')
    expect(heading('cloned')).toBe('Cloned pack (repo)')
    expect(wrapper.find('[data-sidecar-src]').exists()).toBe(false)

    expect(wrapper.find('[data-sidecar-card="ollama"]').attributes('data-card-layout')).toBe('compact')
    expect(wrapper.find('[data-sidecar-card="opencode"]').attributes('data-card-layout')).toBe('compact')
    expect(wrapper.find('[data-sidecar-card="my-pack"]').attributes('data-card-layout')).toBe('compact')
  })

  it('uses the same segmented control for run state, interface type, and kind', async () => {
    payload.sidecars[1]!.interfaces = [{ type: 'webui', service: 'opencode' }]
    const SidecarsPage = await import('../../src/ui/pages/sidecars/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SidecarsPage)

    const groupClass = ['flex', 'rounded-lg', 'border', 'p-0.5']
    const state = wrapper.get('[aria-label="Run state"]')
    const type = wrapper.get('[aria-label="Interface type"]')
    const kind = wrapper.get('[aria-label="Sidecar kind"]')
    for (const group of [state, type, kind]) {
      expect(group.attributes('role')).toBe('group')
      expect(group.classes()).toEqual(expect.arrayContaining(groupClass))
      expect(group.find('[role="tab"]').exists()).toBe(false)
      expect(group.findAll('button').every((btn) => btn.attributes('aria-pressed') != null)).toBe(true)
    }
    expect(state.classes()).toEqual(type.classes())
    expect(type.classes()).toEqual(kind.classes())
    expect(kind.classes()).toContain('w-fit')

    const filters = wrapper.get('[data-sidecar-filters]')
    expect(filters.element.contains(state.element)).toBe(true)
    expect(filters.element.contains(type.element)).toBe(true)
    expect(filters.element.contains(kind.element)).toBe(true)
    expect(filters.text()).not.toContain('Add sidecar')
    expect(filters.text()).not.toContain('From a repo')
    const add = wrapper.findAll('button').find((btn) => btn.text() === 'Add sidecar')!
    expect(add.element.compareDocumentPosition(filters.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const card = wrapper.get('[data-sidecar-card="opencode"]')
    const actions = card.get('[data-sidecar-actions]')
    const toggles = card.get('[data-sidecar-toggles]')
    const details = card.get('[data-sidecar-details]')
    expect(actions.classes()).not.toContain('justify-end')
    expect(actions.classes()).toContain('items-center')
    expect(actions.text()).toContain('Start')
    expect(actions.text()).toContain('Stop')
    expect(actions.text()).toContain('Restart')
    expect(actions.text()).toContain('Logs')
    expect(actions.text()).not.toContain('Autostart')
    expect(actions.text()).not.toContain('Pin in nav')
    const chevron = actions.get('[aria-label="Show sidecar details"]')
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
    const ids = () => wrapper.findAll('[data-sidecar-card]').map((card) => card.attributes('data-sidecar-card'))

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

  it('shows Logs on every card and labels a gui open like a web link', async () => {
    const saved = payload.sidecars.map((row) => ({ ...row }))
    payload.sidecars = [
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
      const SidecarsPage = await import('../../src/ui/pages/sidecars/index.vue').then((m) => m.default)
      const wrapper = await mountSuspended(SidecarsPage)
      for (const id of ['ollama', 'opencode', 'my-pack', 'cursor', 'pi']) {
        const actions = wrapper.get(`[data-sidecar-card="${id}"] [data-sidecar-actions]`)
        expect(actions.text()).toContain('Logs')
        expect(actions.html()).toContain(`/sidecars/${id}/logs`)
      }
      const cursor = wrapper.get('[data-sidecar-card="cursor"] [data-sidecar-actions]')
      const labels = cursor.findAll('a,button').map((btn) => btn.text().trim())
      expect(labels).toContain('Open Cursor')
      expect(labels).not.toContain('GUI')
      expect(labels.indexOf('Restart')).toBeLessThan(labels.indexOf('Open Cursor'))
      expect(labels.indexOf('Open Cursor')).toBeLessThan(labels.indexOf('Logs'))
      expect(wrapper.get('[data-sidecar-card="pi"] [data-sidecar-actions]').text()).not.toContain('Open Pi')
    } finally {
      payload.sidecars = saved
    }
  })
})
