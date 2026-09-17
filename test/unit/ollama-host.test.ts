import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as docker from '../../src/server/utils/docker'
import {
  findHostOllama,
  hostOllamaUrl,
  probeOllamaVersion,
  resetOllamaHostCache,
  resolveOllamaChat,
  setOllamaManualPortForTests,
} from '../../src/server/utils/ollamaHost'

describe('ollama host probe', () => {
  let dataDir = ''

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-test-'))
    process.env.BROS_DATA_DIR = dataDir
    process.env.BROS_WORKING_DIR = dataDir
    resetOllamaHostCache()
    setOllamaManualPortForTests(null)
    vi.spyOn(docker, 'publishedPortOwner').mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
  })

  afterEach(() => {
    resetOllamaHostCache()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('accepts /api/version JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '0.11.0' }),
    })))
    expect(await probeOllamaVersion(11434)).toEqual({ version: '0.11.0' })
  })

  it('rejects non-Ollama HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'ok' }),
    })))
    expect(await probeOllamaVersion(8080)).toBeNull()
  })

  it('prefers host URL when mode unset and scan hits', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':11434/api/version')) {
        return { ok: true, json: async () => ({ version: '0.9.0' }) }
      }
      throw new Error('offline')
    }))
    const chat = await resolveOllamaChat(undefined)
    expect(chat.source).toBe('host')
    expect(chat.baseUrl).toBe(hostOllamaUrl(11434))
    expect(chat.host).toEqual({ port: 11434, version: '0.9.0' })
  })

  it('uses sidecar DNS when mode is sidecar', async () => {
    const chat = await resolveOllamaChat('sidecar')
    expect(chat.source).toBe('sidecar')
    expect(chat.baseUrl).toBe('http://ollama:11434')
  })

  it('honors persisted host mode when scan hits', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':11434/api/version')) {
        return { ok: true, json: async () => ({ version: '0.9.0' }) }
      }
      throw new Error('offline')
    }))
    const chat = await resolveOllamaChat('host')
    expect(chat.source).toBe('host')
    expect(chat.baseUrl).toBe(hostOllamaUrl(11434))
  })

  it('treats legacy external mode as host when scan hits', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':11434/api/version')) {
        return { ok: true, json: async () => ({ version: '0.9.0' }) }
      }
      throw new Error('offline')
    }))
    const chat = await resolveOllamaChat('external')
    expect(chat.source).toBe('host')
    expect(chat.baseUrl).toBe(hostOllamaUrl(11434))
  })

  it('treats legacy external mode as sidecar when scan misses', async () => {
    const chat = await resolveOllamaChat('external')
    expect(chat.source).toBe('sidecar')
    expect(chat.baseUrl).toBe('http://ollama:11434')
  })

  it('defaults to sidecar DNS when scan misses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
    const chat = await resolveOllamaChat(undefined)
    expect(chat.source).toBe('sidecar')
    expect(chat.baseUrl).toBe('http://ollama:11434')
    expect(chat.host).toBeNull()
  })

  it('skips bros-sc-ollama and continues the scan', async () => {
    vi.mocked(docker.publishedPortOwner).mockImplementation(async (port: number) => {
      if (port === 11434) return { project: 'bros-sc-ollama' }
      return null
    })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes(':11434/api/version')) {
        return { ok: true, json: async () => ({ version: 'sidecar-not-host' }) }
      }
      if (u.includes(':11436/api/version')) {
        return { ok: true, json: async () => ({ version: '0.9.1' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit).toEqual({ port: 11436, version: '0.9.1', error: null, manual: false })
    const called = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(called.some((u) => u.includes(':11434/'))).toBe(false)
  })

  it('fails loud on a manual port with no silent fallback', async () => {
    setOllamaManualPortForTests(22001)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':11434/api/version')) {
        return { ok: true, json: async () => ({ version: 'would-fallback' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit.port).toBeNull()
    expect(hit.manual).toBe(true)
    expect(hit.error).toBe('No Ollama on :22001')
  })

  it('uses hostProbe.ports from sidecar.yml', async () => {
    const dir = join(dataDir, 'sidecars', 'ollama')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'sidecar.yml'), `
id: ollama
name: Ollama
hostProbe:
  ports: [22000]
  path: /api/version
interfaces:
  - type: api
    service: ollama
    containerPort: 11434
    publish: 11435
`)
    writeFileSync(join(dir, 'docker-compose.yml'), `
services:
  ollama:
    image: ollama/ollama
`)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':22000/api/version')) {
        return { ok: true, json: async () => ({ version: 'from-yaml' }) }
      }
      if (String(url).includes(':11434/api/version')) {
        return { ok: true, json: async () => ({ version: 'default-scan' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit).toEqual({ port: 22000, version: 'from-yaml', error: null, manual: false })
  })
})
