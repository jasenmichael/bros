import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const { payload, refreshMock } = vi.hoisted(() => ({
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
        interfaces: [],
        settings: { autostart: true, navPinned: false },
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
        settings: { autostart: false, navPinned: false },
        status: { running: true, services: [] },
        hasContainer: true,
      },
      {
        id: 'firecrawl',
        name: 'Firecrawl',
        description: 'Scrape API',
        source: 'shipped' as const,
        kind: 'addon' as const,
        packageSlug: 'firecrawl',
        interfaces: [{ type: 'api', service: 'firecrawl', containerPort: 3002, publish: 3002, basePath: '/v2' }],
        settings: { autostart: false, navPinned: false },
        status: { running: true, services: [] },
        hasContainer: true,
        hostPort: 3002,
      },
      {
        id: 'firecrawl-ui',
        name: 'Firecrawl UI',
        description: 'Scrape UI',
        source: 'shipped' as const,
        kind: 'addon' as const,
        packageSlug: 'firecrawl-ui',
        interfaces: [{ type: 'webui', service: 'firecrawl-ui', containerPort: 8080, publish: 3081 }],
        settings: { autostart: false, navPinned: false },
        status: { running: true, services: [] },
        hasContainer: true,
        hostPort: 3081,
      },
    ],
  },
  refreshMock: vi.fn(async () => {}),
}))

mockNuxtImport('useFetch', () => {
  return () => ({
    data: ref(payload),
    refresh: refreshMock,
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

describe('Ollama dockerApp lock', () => {
  it('hides Start, Stop, Restart, and Autostart on the ollama card only', async () => {
    const AppsPage = await import('../../app/ui/pages/apps/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(AppsPage)
    expect(wrapper.text()).toContain('Core')
    expect(wrapper.text()).toContain('Addon')

    const cards = wrapper.findAll('article')
    const ollama = cards.find((card) => card.text().includes('Ollama'))
    const opencode = cards.find((card) => card.text().includes('OpenCode'))
    expect(ollama).toBeTruthy()
    expect(opencode).toBeTruthy()

    const ollamaButtons = ollama!.findAll('button').map((b) => b.text())
    expect(ollamaButtons).not.toContain('Start')
    expect(ollamaButtons).not.toContain('Stop')
    expect(ollamaButtons).not.toContain('Restart')
    expect(ollama!.text()).not.toContain('Autostart')
    expect(ollama!.text()).not.toContain('Pin in nav')
    expect(ollama!.text()).toContain('Ollama (core)')
    expect(ollama!.text()).not.toContain('shipped')

    const otherButtons = opencode!.findAll('button').map((b) => b.text())
    expect(otherButtons).toContain('Start')
    expect(otherButtons).toContain('Stop')
    expect(otherButtons).toContain('Restart')
    expect(opencode!.text()).toContain('Autostart')
    expect(opencode!.text()).not.toContain('Mode')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(opencode!.text()).toContain('OpenCode (addon)')
    expect(opencode!.text()).not.toContain('shipped')
    expect(wrapper.text()).toContain('Add app')
    expect(wrapper.text()).toContain('From a repo')
  })

  it('copies published Firecrawl api without an Open button', async () => {
    const AppsPage = await import('../../app/ui/pages/apps/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(AppsPage)
    const firecrawl = wrapper.find('[data-app-card="firecrawl"]')
    expect(firecrawl.exists()).toBe(true)
    expect(firecrawl.text()).not.toContain('Open Firecrawl (:3002)')
    const urls = firecrawl.findAll('.font-mono').map((node) => node.text())
    expect(urls).toEqual([
      'http://127.0.0.1:3002/v2',
      'http://firecrawl:3002/v2',
    ])
    expect(firecrawl.text()).toContain('Bros Docker network')
    expect(firecrawl.text()).not.toContain('Pin in nav')
  })

  it('opens published Firecrawl UI webui', async () => {
    const AppsPage = await import('../../app/ui/pages/apps/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(AppsPage)
    const ui = wrapper.find('[data-app-card="firecrawl-ui"]')
    expect(ui.exists()).toBe(true)
    const title = ui.get('h3')
    const types = ui.get('[data-app-types]')
    expect(types.text()).toBe('webui')
    expect(title.element.parentElement).toBe(types.element.parentElement)
    expect(title.element.compareDocumentPosition(types.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const description = ui.get('p')
    expect(types.element.compareDocumentPosition(description.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(ui.get('[data-app-actions]').element.contains(types.element)).toBe(false)
    expect(ui.text()).toContain('Open Firecrawl UI (:3081)')
    expect(ui.text()).toContain('Pin in nav')
    const actions = ui.get('[data-app-actions]')
    const toggles = ui.get('[data-app-toggles]')
    expect(actions.classes()).not.toContain('justify-end')
    expect(actions.text()).toContain('Open Firecrawl UI (:3081)')
    expect(actions.text()).toContain('Start')
    expect(actions.text()).toContain('Logs')
    expect(actions.text()).not.toContain('Autostart')
    expect(actions.text()).not.toContain('Pin in nav')
    const chevron = actions.get('[aria-label="Show app details"]')
    expect(chevron.classes()).toContain('ml-auto')
    expect(chevron.element).toBe(actions.element.lastElementChild)
    expect(actions.findAll('button').find((btn) => btn.text() === 'Start')!.classes()).not.toContain('ml-auto')
    expect(toggles.text()).toContain('Autostart')
    expect(toggles.text()).toContain('Pin in nav')
    expect(actions.element.compareDocumentPosition(toggles.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(ui.get('[data-app-details]').text()).not.toContain('Open Firecrawl UI')
  })

  it('spins only the Start button while start is in flight', async () => {
    const AppsPage = await import('../../app/ui/pages/apps/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(AppsPage)
    const vm = wrapper.vm as unknown as { busy: Set<string> }
    vm.busy = new Set(['firecrawl:start'])
    await nextTick()
    const firecrawl = wrapper.find('[data-app-card="firecrawl"]')
    const start = firecrawl.findAll('button').find((b) => b.text().includes('Start'))
    const stop = firecrawl.findAll('button').find((b) => b.text().includes('Stop'))
    const restart = firecrawl.findAll('button').find((b) => b.text().includes('Restart'))
    expect(start).toBeTruthy()
    expect(stop).toBeTruthy()
    expect(restart).toBeTruthy()
    expect(start!.html()).toMatch(/animate-spin|aria-busy="true"/)
    expect(stop!.html()).not.toMatch(/animate-spin/)
    expect(restart!.html()).not.toMatch(/animate-spin/)
    expect((stop!.element as HTMLButtonElement).disabled).toBe(true)
    expect((restart!.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('refreshes statuses from a card icon', async () => {
    refreshMock.mockClear()
    const AppsPage = await import('../../app/ui/pages/apps/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(AppsPage)
    const firecrawl = wrapper.find('[data-app-card="firecrawl"]')
    const btn = firecrawl.get('[aria-label="Refresh app status"]')
    await btn.trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
