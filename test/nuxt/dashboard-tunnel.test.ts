import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const { fetchMock, summary } = vi.hoisted(() => ({
  fetchMock: vi.fn(async () => ({})),
  summary: {
    viaTunnel: false,
    tunnelHost: null as string | null,
    attention: [
      { id: 'disk', text: '1 GB free on the data disk', href: '/status' },
    ],
    chats: [
      { id: 'c1', title: 'Fix the dock', modelId: 'ollama/llama3.2', updatedAt: Date.now() },
    ],
    providers: {
      ready: 2,
      items: [
        { id: 'ollama', name: 'Ollama (core)', chatOn: true, detail: 'running' },
        { id: 'groq', name: 'Groq', chatOn: true, detail: 'Chat on' },
      ],
      pulls: [
        { providerId: 'ollama', model: 'qwen3:14b', phase: 'running' as const, percent: 40 },
      ],
    },
    dockerApps: {
      running: 2,
      total: 2,
      items: [
        { id: 'ollama', name: 'Ollama', phase: 'running' as const, openUrl: null },
        { id: 'opencode', name: 'OpenCode', phase: 'running' as const, openUrl: 'http://127.0.0.1:4097/' },
      ],
    },
    tunnel: {
      running: false,
      hostname: null as string | null,
      publicUrl: null as string | null,
      installed: true,
      loggedIn: true,
      helperAlive: true,
      error: null as string | null,
    },
  },
}))

mockNuxtImport('$fetch', () => fetchMock)

mockNuxtImport('useFetch', () => {
  return () => ({
    data: ref(summary),
    refresh: async () => {},
    pending: ref(false),
  })
})

mockNuxtImport('useSeoMeta', () => () => {})

function card(wrapper: { findAll: (sel: string) => Array<{ find: (sel: string) => { text: () => string }; text: () => string }> }, title: string) {
  return wrapper.findAll('article').find((article) => article.find('h2').text() === title)
}

describe('Dashboard hub', () => {
  it('shows recent chats and a new chat link', async () => {
    const Dashboard = await import('../../app/ui/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    const chats = card(wrapper, 'Chats')
    expect(chats).toBeTruthy()
    expect(chats!.text()).toContain('Fix the dock')
    expect(chats!.text()).toContain('ollama/llama3.2')
    expect(chats!.find('a[href="/chat/c1"]').exists()).toBe(true)
    expect(chats!.find('a[href="/chat"]').text()).toBe('New chat')
    expect(wrapper.text()).not.toContain('Socket reachable')
    expect(wrapper.text()).not.toContain('Drag')
  })

  it('shows providers on for chat and an active pull', async () => {
    const Dashboard = await import('../../app/ui/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    const providers = card(wrapper, 'Providers')
    expect(providers!.text()).toContain('2 on for chat')
    expect(providers!.text()).toContain('Ollama (core)')
    expect(providers!.text()).toContain('running')
    expect(providers!.text()).toContain('Groq')
    expect(providers!.text()).toContain('Pulling qwen3:14b · 40%')
    expect(providers!.find('a[href="/settings/providers"]').exists()).toBe(true)
  })

  it('shows dockerApp phase and opens a running web UI', async () => {
    const Dashboard = await import('../../app/ui/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    const apps = card(wrapper, 'Apps')
    expect(apps!.text()).toContain('2/2 running')
    expect(apps!.text()).toContain('OpenCode')
    const link = apps!.get('a[href="http://127.0.0.1:4097/"]')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.text()).toBe('Open')
    expect(wrapper.text()).not.toContain('cloudflared dockerApp missing')
    expect(wrapper.find('a[href="/settings/desktop/apps"]').exists()).toBe(true)
  })

  it('links attention items to the page that can fix them', async () => {
    const Dashboard = await import('../../app/ui/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    const link = wrapper.get('a[href="/status"]')
    expect(link.text()).toContain('1 GB free on the data disk')
  })
})

function resetTunnelSummary(patch: Partial<typeof summary.tunnel> & { viaTunnel?: boolean; tunnelHost?: string | null } = {}) {
  summary.viaTunnel = patch.viaTunnel ?? false
  summary.tunnelHost = patch.tunnelHost ?? null
  summary.tunnel.running = patch.running ?? false
  summary.tunnel.hostname = patch.hostname ?? null
  summary.tunnel.publicUrl = patch.publicUrl ?? null
  summary.tunnel.error = patch.error ?? null
  summary.tunnel.helperAlive = patch.helperAlive ?? true
  summary.tunnel.installed = patch.installed ?? true
  summary.tunnel.loggedIn = patch.loggedIn ?? true
}

describe('Dashboard tunnel card', () => {
  it('shows Tunnel on the hub and starts the host process when off', async () => {
    resetTunnelSummary()
    fetchMock.mockClear()

    const Dashboard = await import('../../app/ui/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.text()).toContain('Tunnel')
    expect(wrapper.text()).toContain('stopped')
    expect(wrapper.text()).toContain('Logs')
    expect(wrapper.text()).not.toContain('cloudflared dockerApp missing')
    expect(wrapper.text()).not.toContain('trycloudflare.com')

    const toggle = wrapper.get('[aria-label="Turn Cloudflare tunnel on"]')
    expect(toggle.classes().join(' ')).toMatch(/border-error/)
    expect(toggle.classes().join(' ')).not.toMatch(/border-success/)
    await toggle.trigger('click')
    expect(fetchMock).toHaveBeenCalledWith('/api/tunnel/start', { method: 'POST' })
  })

  it('hides a stale quick-tunnel URL while stopped', async () => {
    resetTunnelSummary({
      tunnelHost: 'knives-invision-luck-biodiversity.trycloudflare.com',
      hostname: 'knives-invision-luck-biodiversity.trycloudflare.com',
      publicUrl: 'https://knives-invision-luck-biodiversity.trycloudflare.com',
    })

    const Dashboard = await import('../../app/ui/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.text()).toContain('stopped')
    expect(wrapper.text()).not.toContain('trycloudflare.com')
    expect(wrapper.find('a[href*="trycloudflare.com"]').exists()).toBe(false)
    const toggle = wrapper.get('[aria-label="Turn Cloudflare tunnel on"]')
    expect(toggle.classes().join(' ')).toMatch(/border-error/)
  })

  it('disables stop when the session is via tunnel', async () => {
    resetTunnelSummary({
      viaTunnel: true,
      tunnelHost: 'bros.example.com',
      running: true,
      hostname: 'bros.example.com',
      publicUrl: 'https://bros.example.com',
    })
    fetchMock.mockClear()

    const Dashboard = await import('../../app/ui/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.text()).toContain('running ·')
    expect(wrapper.text()).toContain('https://bros.example.com')
    expect(wrapper.text()).toContain('Stop locked: this session is through the tunnel.')
    const link = wrapper.get('a[href="https://bros.example.com"]')
    expect(link.attributes('target')).toBe('_blank')

    const toggle = wrapper.get('[aria-label="Cannot turn tunnel off while connected through it"]')
    expect((toggle.element as HTMLButtonElement).disabled).toBe(true)
    expect(toggle.classes().join(' ')).toMatch(/border-success/)
    await toggle.trigger('click')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows runtime error while the host process is still running', async () => {
    resetTunnelSummary({
      tunnelHost: 'bros.example.com',
      running: true,
      hostname: 'bros.example.com',
      publicUrl: 'https://bros.example.com',
      error: 'failed to accept QUIC stream: timeout: no recent network activity',
    })

    const Dashboard = await import('../../app/ui/pages/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(Dashboard)
    expect(wrapper.text()).toContain('failed to accept QUIC stream: timeout: no recent network activity')
    expect(wrapper.text()).toContain('https://bros.example.com')
    expect(wrapper.text()).toContain('running')
  })
})
