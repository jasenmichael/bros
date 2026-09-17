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
      installed: true,
      loggedIn: true,
      helperAlive: true,
      error: null as string | null,
    },
    app: { ok: true, service: 'bros', port: 3055 },
    docker: { ok: true },
    disk: { path: '/data', freeBytes: 1, totalBytes: 2, freeLabel: '1 GB', totalLabel: '2 GB' },
    gpu: { available: false },
    sidecars: [
      {
        id: 'ollama',
        name: 'Ollama',
        running: true,
        effectiveMode: 'sidecar',
        hostManaged: false,
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

  it('does not list cloudflared as a sidecar snippet', async () => {
    const Dashboard = await import('../../src/app/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.text()).toContain('Ollama')
    expect(wrapper.text()).not.toMatch(/Sidecar snippets[\s\S]*cloudflared/)
  })
})
