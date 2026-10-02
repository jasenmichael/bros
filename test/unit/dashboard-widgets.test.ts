import { describe, expect, it } from 'vitest'
import { sidecarPhase } from '../../src/server/utils/docker'
import { parseMeminfo } from '../../src/server/utils/memory'
import {
  buildAttention,
  diskNeedsAttention,
  selectDashboardProviders,
  webuiOpenUrl,
} from '../../src/server/utils/dashboardSummary'

const GiB = 1024 * 1024 * 1024

describe('sidecarPhase', () => {
  it('reports starting only while the container is not running', () => {
    expect(sidecarPhase('ollama', false)).toBe('stopped')
    expect(sidecarPhase('ollama', true)).toBe('running')
    expect(sidecarPhase('ollama', false, 'Port 11435 is already in use.')).toBe('error')
    expect(sidecarPhase('ollama', true, 'stale')).toBe('error')
  })
})

describe('parseMeminfo', () => {
  it('prefers MemAvailable and falls back to MemFree', () => {
    const parsed = parseMeminfo(`
MemTotal:       2048 kB
MemFree:         100 kB
MemAvailable:   1024 kB
`)
    expect(parsed).toEqual({ totalBytes: 2048 * 1024, availableBytes: 1024 * 1024 })
    const freeOnly = parseMeminfo('MemTotal: 10 kB\nMemFree: 4 kB\n')
    expect(freeOnly).toEqual({ totalBytes: 10 * 1024, availableBytes: 4 * 1024 })
    expect(parseMeminfo('MemFree: 4 kB\n')).toBeNull()
  })
})

describe('dashboard hub', () => {
  it('lists Ollama, host Ollama when enabled, and Chat-on providers', () => {
    const hidden = selectDashboardProviders([
      { id: 'ollama', name: 'Ollama (core)', enabled: true },
      { id: 'ollama-host', name: 'Ollama (host)', enabled: true },
      { id: 'groq', name: 'Groq', enabled: false },
      { id: 'openai', name: 'OpenAI', enabled: true },
    ], { hostEnabled: false, ollamaPhase: 'running' })
    expect(hidden.items.map((item) => item.id)).toEqual(['ollama', 'openai'])
    expect(hidden.ready).toBe(2)

    const stopped = selectDashboardProviders([
      { id: 'ollama', name: 'Ollama (core)', enabled: true },
      { id: 'ollama-host', name: 'Ollama (host)', enabled: false },
    ], { hostEnabled: true, ollamaPhase: 'stopped' })
    expect(stopped.items.map((item) => item.detail)).toEqual(['stopped', 'Chat off'])
    expect(stopped.ready).toBe(0)
  })

  it('opens a running web UI on the host and hides it via tunnel', () => {
    const interfaces = [{ type: 'webui', publish: 4097 }, { type: 'cli' }]
    expect(webuiOpenUrl(interfaces, false)).toBe('http://127.0.0.1:4097/')
    expect(webuiOpenUrl(interfaces, true)).toBeNull()
    expect(webuiOpenUrl([{ type: 'api', publish: 11435 }], false)).toBeNull()
    expect(webuiOpenUrl([{ type: 'webui', publish: 8092, basePath: '/docs' }], false))
      .toBe('http://127.0.0.1:8092/docs')
  })

  it('warns on docker, sidecar errors, stopped Ollama, low disk, and no chat', () => {
    expect(diskNeedsAttention(1.5 * GiB, 20 * GiB)).toBe(true)
    expect(diskNeedsAttention(3 * GiB, 100 * GiB)).toBe(true)
    expect(diskNeedsAttention(20 * GiB, 100 * GiB)).toBe(false)

    const items = buildAttention({
      dockerOk: false,
      dockerError: 'socket down',
      sidecars: [{ id: 'opencode', name: 'OpenCode', phase: 'error', error: 'port in use' }],
      diskFreeBytes: 1 * GiB,
      diskTotalBytes: 20 * GiB,
      diskFreeLabel: '1 GB',
      chatReady: 0,
      ollamaPhase: 'stopped',
    })
    expect(items.map((item) => item.id)).toEqual(['docker', 'sidecar:opencode', 'ollama', 'disk'])
    expect(items.find((item) => item.id === 'chat')).toBeUndefined()

    const chatOff = buildAttention({
      dockerOk: true,
      dockerError: null,
      sidecars: [],
      diskFreeBytes: 40 * GiB,
      diskTotalBytes: 100 * GiB,
      diskFreeLabel: '40 GB',
      chatReady: 0,
      ollamaPhase: 'running',
    })
    expect(chatOff).toEqual([{ id: 'chat', text: 'No provider is on for chat', href: '/providers' }])
  })
})
