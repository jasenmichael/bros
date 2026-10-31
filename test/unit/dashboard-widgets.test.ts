import { describe, expect, it } from 'vitest'
import { markAutostartFailed, dockerAppPhase, dockerAppPortWarning } from '../../app/server/utils/docker'
import {
  buildAttention,
  diskNeedsAttention,
  selectDashboardProviders,
  webuiOpenUrl,
} from '../../app/server/utils/dashboardSummary'

const GiB = 1024 * 1024 * 1024

describe('dockerAppPhase', () => {
  it('reports starting only while the container is not running', () => {
    expect(dockerAppPhase('ollama', false)).toBe('stopped')
    expect(dockerAppPhase('ollama', true)).toBe('running')
    expect(dockerAppPhase('ollama', false, 'Port 11435 is already in use.')).toBe('error')
    expect(dockerAppPhase('ollama', true, 'stale')).toBe('running')
    markAutostartFailed('paperclip')
    expect(dockerAppPhase('paperclip', false)).toBe('error')
    expect(dockerAppPhase('paperclip', true)).toBe('running')
    expect(dockerAppPhase('paperclip', false)).toBe('stopped')
  })
})

describe('dockerAppPortWarning', () => {
  it('does not warn when a stopped autostart-off dockerApp has a taken port', () => {
    expect(dockerAppPortWarning({
      running: false,
      autostart: false,
      portOccupied: true,
      ours: false,
      hostPort: 3100,
    })).toBeUndefined()
    expect(dockerAppPortWarning({
      running: false,
      autostart: true,
      portOccupied: true,
      ours: false,
      hostPort: 3100,
    })).toBe('Port 3100 is already in use. Bros docker app cannot start until it is free.')
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

  it('warns on docker, dockerApp errors, stopped Ollama, low disk, and no chat', () => {
    expect(diskNeedsAttention(1.5 * GiB, 20 * GiB)).toBe(true)
    expect(diskNeedsAttention(3 * GiB, 100 * GiB)).toBe(true)
    expect(diskNeedsAttention(20 * GiB, 100 * GiB)).toBe(false)

    const items = buildAttention({
      dockerOk: false,
      dockerError: 'socket down',
      dockerApps: [
        { id: 'opencode', name: 'OpenCode', phase: 'error', error: 'port in use' },
        { id: 'whisper', name: 'Whisper', phase: 'error', error: 'Failed to start dockerApp' },
      ],
      diskFreeBytes: 1 * GiB,
      diskTotalBytes: 20 * GiB,
      diskFreeLabel: '1 GB',
      chatReady: 0,
      ollamaPhase: 'stopped',
    })
    expect(items.map((item) => item.id)).toEqual(['docker', 'dockerApp:whisper', 'ollama', 'disk'])
    expect(items.find((item) => item.href === '/settings/desktop/apps')?.href).toBe('/settings/desktop/apps')
    expect(items.find((item) => item.id === 'chat')).toBeUndefined()

    const chatOff = buildAttention({
      dockerOk: true,
      dockerError: null,
      dockerApps: [],
      diskFreeBytes: 40 * GiB,
      diskTotalBytes: 100 * GiB,
      diskFreeLabel: '40 GB',
      chatReady: 0,
      ollamaPhase: 'running',
    })
    expect(chatOff).toEqual([{ id: 'chat', text: 'No provider is on for chat', href: '/settings/providers' }])
  })
})
