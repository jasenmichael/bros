import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const { fetchMock, status } = vi.hoisted(() => ({
  fetchMock: vi.fn(async () => ({})),
  status: {
    viaTunnel: false,
    tunnelHost: null as string | null,
    tunnel: {
      running: false,
      hostname: null as string | null,
      publicUrl: null as string | null,
      installed: true,
      loggedIn: true,
      helperAlive: true,
      error: null as string | null,
    },
    app: { ok: true, service: 'bros', port: 3055 },
    docker: { ok: true },
    disk: { path: '/data', freeBytes: 1, totalBytes: 2, freeLabel: '1 GB', totalLabel: '2 GB' },
    gpu: { available: false },
    enableHostOllama: false,
    containers: [
      {
        id: 'app',
        name: 'bros',
        service: 'bros',
        project: 'bros',
        kind: 'app' as const,
        sidecarId: null as string | null,
        state: 'running',
        status: 'Up',
        running: true,
        ports: [3055],
      },
      {
        id: 'fc-redis',
        name: 'bros-sc-firecrawl-redis-1',
        service: 'redis',
        project: 'bros-sc-firecrawl',
        kind: 'sidecar' as const,
        sidecarId: 'firecrawl',
        state: 'exited',
        status: 'Exited (0)',
        running: false,
        ports: [] as number[],
      },
    ],
    sidecars: [
      {
        id: 'ollama',
        name: 'Ollama',
        running: true,
        hostPort: 11435,
        hasContainer: true,
        hostOllama: { port: 3080, version: '0.1' },
        hostOllamaError: null as string | null,
      },
      {
        id: 'opencode',
        name: 'OpenCode',
        running: true,
        hostPort: 4097,
        hasContainer: true,
      },
      {
        id: 'firecrawl',
        name: 'Firecrawl',
        running: false,
        hostPort: 3002,
        hasContainer: true,
      },
    ],
  },
}))

mockNuxtImport('$fetch', () => fetchMock)

mockNuxtImport('useFetch', () => {
  return () => ({
    data: ref(status),
    refresh: async () => {},
    pending: ref(false),
  })
})

mockNuxtImport('useSeoMeta', () => () => {})

describe('Dashboard tunnel card', () => {
  it('shows Tunnel on the widget grid and starts the host process when off', async () => {
    status.viaTunnel = false
    status.tunnelHost = null
    status.tunnel.running = false
    status.tunnel.hostname = null
    status.tunnel.error = null
    status.tunnel.helperAlive = true
    fetchMock.mockClear()

    const Dashboard = await import('../../src/app/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.text()).toContain('Tunnel')
    expect(wrapper.text()).toContain('stopped')
    expect(wrapper.text()).toContain('Details')
    expect(wrapper.text()).not.toContain('cloudflared sidecar missing')

    const toggle = wrapper.get('[aria-label="Turn Cloudflare tunnel on"]')
    await toggle.trigger('click')
    expect(fetchMock).toHaveBeenCalledWith('/api/tunnel/start', { method: 'POST' })
  })

  it('disables stop when the session is via tunnel', async () => {
    status.viaTunnel = true
    status.tunnelHost = 'bros.example.com'
    status.tunnel.running = true
    status.tunnel.hostname = 'bros.example.com'
    status.tunnel.error = null
    status.tunnel.helperAlive = true
    fetchMock.mockClear()

    const Dashboard = await import('../../src/app/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.text()).toContain('running ·')
    expect(wrapper.text()).toContain('https://bros.example.com')
    expect(wrapper.text()).toContain('Stop locked: this session is through the tunnel.')
    const link = wrapper.get('a[href="https://bros.example.com"]')
    expect(link.attributes('target')).toBe('_blank')

    const toggle = wrapper.get('[aria-label="Cannot turn tunnel off while connected through it"]')
    expect((toggle.element as HTMLButtonElement).disabled).toBe(true)
    await toggle.trigger('click')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows runtime error while the host process is still running', async () => {
    status.viaTunnel = false
    status.tunnelHost = 'bros.example.com'
    status.tunnel.running = true
    status.tunnel.hostname = 'bros.example.com'
    status.tunnel.publicUrl = 'https://bros.example.com'
    status.tunnel.error = 'failed to accept QUIC stream: timeout: no recent network activity'
    status.tunnel.helperAlive = true
    status.tunnel.installed = true
    status.tunnel.loggedIn = true

    const Dashboard = await import('../../src/app/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.text()).toContain('failed to accept QUIC stream: timeout: no recent network activity')
    expect(wrapper.text()).toContain('https://bros.example.com')
    expect(wrapper.text()).toContain('running')
  })

  it('does not list cloudflared as a sidecar snippet', async () => {
    const Dashboard = await import('../../src/app/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.text()).toContain('Ollama')
    expect(wrapper.text()).not.toMatch(/Sidecar snippets[\s\S]*cloudflared/)
  })

  it('has no Sidecars summary card in the widget grid', async () => {
    status.enableHostOllama = false
    const Dashboard = await import('../../src/app/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.text()).toContain('Sidecar snippets')
    expect(wrapper.text()).toContain('Tunnel')
    expect(wrapper.text()).not.toContain('Manage')
    expect(wrapper.find('a[href="/sidecars"]').exists()).toBe(false)
  })

  it('shows an Ollama provider card, not addon sidecars', async () => {
    status.enableHostOllama = false
    const Dashboard = await import('../../src/app/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    const ollamaCard = wrapper.findAll('article').find((article) => article.find('h2').text() === 'Ollama')
    expect(ollamaCard).toBeTruthy()
    expect(ollamaCard!.text()).toContain('Sidecar (core):')
    expect(ollamaCard!.text()).toContain('up')
    expect(ollamaCard!.text()).toContain('http://127.0.0.1:11435/')
    expect(ollamaCard!.text()).not.toContain('OpenCode')
    expect(ollamaCard!.text()).not.toContain('Open WebUI')
    expect(ollamaCard!.text()).not.toContain('Host:')
    expect(ollamaCard!.find('a[href="/providers"]').exists()).toBe(true)
  })

  it('shows host Ollama on the Ollama card only when the settings gate is on', async () => {
    status.enableHostOllama = true
    const Dashboard = await import('../../src/app/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    const ollamaCard = wrapper.findAll('article').find((article) => article.find('h2').text() === 'Ollama')
    expect(ollamaCard!.text()).toContain('Host:')
    expect(ollamaCard!.text()).toContain('http://127.0.0.1:3080/')
    expect(wrapper.text()).not.toMatch(/Sidecar snippets[\s\S]*host :/)
    status.enableHostOllama = false
  })

  it('lists Bros-managed Docker containers including the app', async () => {
    const Dashboard = await import('../../src/app/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.text()).toContain('Bros services')
    expect(wrapper.text()).toContain('App')
    expect(wrapper.text()).toContain('bros')
    expect(wrapper.text()).toContain(':3055')
    expect(wrapper.text()).toContain('Firecrawl')
    expect(wrapper.text()).toContain('redis')
    expect(wrapper.text()).toContain('exited')
  })
})
