import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const { payload, refreshMock } = vi.hoisted(() => ({
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
        interfaces: [],
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
        id: 'firecrawl',
        name: 'Firecrawl',
        description: 'Scrape API',
        source: 'shipped' as const,
        kind: 'addon' as const,
        packageSlug: 'firecrawl',
        interfaces: [{ type: 'api', service: 'firecrawl', containerPort: 3002, publish: 3002, basePath: '/v2' }],
        settings: { autostart: false, navPinned: false, hostMode: 'auto' as const },
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
        settings: { autostart: false, navPinned: false, hostMode: 'auto' as const },
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
mockNuxtImport('usePinnedNav', () => () => ({ refreshPinnedNav: async () => {} }))

describe('Ollama sidecar lock', () => {
  it('hides Start, Stop, Restart, and Autostart on the ollama card only', async () => {
    const SidecarsPage = await import('../../src/app/pages/sidecars/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SidecarsPage)
    const headings = wrapper.findAll('h2').map((h) => h.text())
    expect(headings).toEqual(['Core', 'Addon sidecars'])

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
    expect(ollama!.text()).toContain('bros')
    expect(ollama!.text()).not.toContain('shipped')

    const otherButtons = opencode!.findAll('button').map((b) => b.text())
    expect(otherButtons).toContain('Start')
    expect(otherButtons).toContain('Stop')
    expect(otherButtons).toContain('Restart')
    expect(opencode!.text()).toContain('Autostart')
    expect(opencode!.text()).toContain('bros')
    expect(opencode!.text()).not.toContain('shipped')
    expect(wrapper.text()).toContain('Add sidecar')
    expect(wrapper.text()).toContain('From a repo')
  })

  it('opens and copies published Firecrawl api', async () => {
    const SidecarsPage = await import('../../src/app/pages/sidecars/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SidecarsPage)
    const firecrawl = wrapper.find('[data-sidecar-card="firecrawl"]')
    expect(firecrawl.exists()).toBe(true)
    expect(firecrawl.text()).toContain('Open Firecrawl (:3002)')
    expect(firecrawl.text()).toContain('http://127.0.0.1:3002/')
    expect(firecrawl.text()).toContain('http://127.0.0.1:3002/v2')
    expect(firecrawl.text()).toContain('http://firecrawl:3002/')
    expect(firecrawl.text()).toContain('http://firecrawl:3002/v2')
    expect(firecrawl.text()).toContain('Bros Docker network')
    expect(firecrawl.text()).toContain('Pin in nav')
  })

  it('opens published Firecrawl UI webui', async () => {
    const SidecarsPage = await import('../../src/app/pages/sidecars/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SidecarsPage)
    const ui = wrapper.find('[data-sidecar-card="firecrawl-ui"]')
    expect(ui.exists()).toBe(true)
    expect(ui.text()).toContain('Open Firecrawl UI (:3081)')
    expect(ui.text()).toContain('Pin in nav')
  })

  it('spins only the Start button while start is in flight', async () => {
    const SidecarsPage = await import('../../src/app/pages/sidecars/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SidecarsPage)
    const vm = wrapper.vm as unknown as { busy: string | null }
    vm.busy = 'firecrawl:start'
    await nextTick()
    const firecrawl = wrapper.find('[data-sidecar-card="firecrawl"]')
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
    const SidecarsPage = await import('../../src/app/pages/sidecars/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SidecarsPage)
    const firecrawl = wrapper.find('[data-sidecar-card="firecrawl"]')
    const btn = firecrawl.get('[aria-label="Refresh sidecar status"]')
    await btn.trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
