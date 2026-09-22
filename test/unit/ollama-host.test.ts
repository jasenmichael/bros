import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as docker from '../../src/server/utils/docker'
import {
  findHostOllama,
  hostOllamaUrl,
  parseProcNetListenPorts,
  probeOllamaVersion,
  resetOllamaHostCache,
  resolveOllamaChat,
  scanHostOllama,
  setDockerPublishedPortsForTests,
  setHostListenPortsForTests,
  setOllamaManualPortForTests,
  sidecarOllamaUrl,
} from '../../src/server/utils/ollamaHost'
import { setAppRunsInDockerForTests } from '../../src/server/utils/hostProbe'

const PROC_LISTEN_11436 = `
  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:2CAC 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 1 1 0000000000000000 100 0 0 10 0
`

describe('ollama host probe', () => {
  let dataDir = ''

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-test-'))
    process.env.BROS_DATA_DIR = dataDir
    process.env.BROS_WORKING_DIR = dataDir
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
    resetOllamaHostCache()
    setOllamaManualPortForTests(null)
    setHostListenPortsForTests([])
    setDockerPublishedPortsForTests([])
    setAppRunsInDockerForTests(undefined)
    vi.spyOn(docker, 'publishedPortOwner').mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
  })

  afterEach(async () => {
    resetOllamaHostCache()
    setAppRunsInDockerForTests(undefined)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('accepts /api/version JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '0.11.0' }),
    })))
    expect(await probeOllamaVersion(11434)).toEqual({ version: '0.11.0', host: '127.0.0.1' })
  })

  it('rejects non-Ollama HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'ok' }),
    })))
    expect(await probeOllamaVersion(8080)).toBeNull()
  })

  it('parses LISTEN ports from /proc/net/tcp', () => {
    expect(parseProcNetListenPorts(PROC_LISTEN_11436)).toEqual([11436])
    expect(parseProcNetListenPorts('  sl  local_address rem_address   st\n')).toEqual([])
  })

  it('prefers host URL when mode unset and listen scan hits', async () => {
    setHostListenPortsForTests([11434])
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
    expect(chat.baseUrl).toBe(sidecarOllamaUrl())
  })

  it('honors persisted host mode when scan hits', async () => {
    setHostListenPortsForTests([11434])
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
    setHostListenPortsForTests([11434])
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
    expect(chat.baseUrl).toBe(sidecarOllamaUrl())
  })

  it('defaults to sidecar DNS when scan misses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
    const chat = await resolveOllamaChat(undefined)
    expect(chat.source).toBe('sidecar')
    expect(chat.baseUrl).toBe(sidecarOllamaUrl())
    expect(chat.host).toBeNull()
  })

  it('skips bros-sc-ollama and continues the scan', async () => {
    setHostListenPortsForTests([11434, 11436])
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
    expect(hit).toEqual({ port: 11436, version: '0.9.1', host: '127.0.0.1', error: null, manual: false })
    const called = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(called.some((u) => u.includes(':11434/'))).toBe(false)
  })

  it('skips other bros-sc-* published ports', async () => {
    setDockerPublishedPortsForTests([
      { port: 3080, image: 'ghcr.io/open-webui/open-webui', containerName: '/openwebui', project: 'bros-sc-openwebui' },
      { port: 11436, image: 'nginx', containerName: '/web' },
    ])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':3080/api/version')) {
        return { ok: true, json: async () => ({ version: 'not-host' }) }
      }
      if (String(url).includes(':11436/api/version')) {
        return { ok: true, json: async () => ({ version: 'host-ok' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit.port).toBe(11436)
    const called = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(called.some((u) => u.includes(':3080/'))).toBe(false)
  })

  it('prefers host default 11434 over a docker Ollama published port', async () => {
    setDockerPublishedPortsForTests([
      { port: 22000, image: 'ollama/ollama', containerName: '/my-ollama', project: 'other' },
      { port: 11434, image: 'nginx', containerName: '/web' },
    ])
    setHostListenPortsForTests([11434])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':22000/api/version')) {
        return { ok: true, json: async () => ({ version: 'from-docker' }) }
      }
      if (String(url).includes(':11434/api/version')) {
        return { ok: true, json: async () => ({ version: 'from-listen' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit).toEqual({ port: 11434, version: 'from-listen', host: '127.0.0.1', error: null, manual: false })
    const called = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(called.some((u) => u.includes(':11434/'))).toBe(true)
    expect(called.some((u) => u.includes(':22000/'))).toBe(false)
  })

  it('uses docker Ollama published port when default 11434 misses', async () => {
    setDockerPublishedPortsForTests([
      { port: 22000, image: 'ollama/ollama', containerName: '/my-ollama', project: 'other' },
    ])
    setHostListenPortsForTests([])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':11434/api/version')) throw new Error('offline')
      if (String(url).includes(':22000/api/version')) {
        return { ok: true, json: async () => ({ version: 'from-docker' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit).toEqual({ port: 22000, version: 'from-docker', host: '127.0.0.1', error: null, manual: false })
    const called = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    const defaultIdx = called.findIndex((u) => u.includes(':11434/'))
    const dockerIdx = called.findIndex((u) => u.includes(':22000/'))
    expect(defaultIdx).toBeGreaterThanOrEqual(0)
    expect(dockerIdx).toBeGreaterThan(defaultIdx)
  })

  it('hits a /proc listen port when docker has no Ollama', async () => {
    setHostListenPortsForTests(parseProcNetListenPorts(PROC_LISTEN_11436))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':11436/api/version')) {
        return { ok: true, json: async () => ({ version: 'from-proc' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit).toEqual({ port: 11436, version: 'from-proc', host: '127.0.0.1', error: null, manual: false })
  })

  it('skips sidecar publish 11435', async () => {
    setHostListenPortsForTests([11435, 11436])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':11435/api/version')) {
        return { ok: true, json: async () => ({ version: 'sidecar-publish' }) }
      }
      if (String(url).includes(':11436/api/version')) {
        return { ok: true, json: async () => ({ version: 'host-ok' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit.port).toBe(11436)
    const called = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(called.some((u) => u.includes(':11435/'))).toBe(false)
  })

  it('fails loud on a manual port with no silent fallback', async () => {
    setOllamaManualPortForTests(22001)
    setHostListenPortsForTests([11434])
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

  it('on host Node lists via 127.0.0.1 and never calls host.docker.internal', async () => {
    setAppRunsInDockerForTests(false)
    setHostListenPortsForTests([11434])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('host.docker.internal')) throw new Error('dns hang')
      if (u.includes('127.0.0.1:11434/api/version')) {
        return { ok: true, json: async () => ({ version: '0.32.14' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit).toEqual({ port: 11434, version: '0.32.14', host: '127.0.0.1', error: null, manual: false })
    const chat = await resolveOllamaChat(undefined)
    expect(chat.baseUrl).toBe('http://127.0.0.1:11434')
    expect(sidecarOllamaUrl()).toBe('http://127.0.0.1:11435')
    const called = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(called.some((u) => u.includes('host.docker.internal'))).toBe(false)
    expect(called.some((u) => u.includes('127.0.0.1:11434'))).toBe(true)
  })

  it('in Docker uses sidecar DNS and host.docker.internal', async () => {
    setAppRunsInDockerForTests(true)
    resetOllamaHostCache()
    setOllamaManualPortForTests(null)
    setDockerPublishedPortsForTests([])
    setHostListenPortsForTests([])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('host.docker.internal:11434/api/version')) {
        return { ok: true, json: async () => ({ version: '0.9.0' }) }
      }
      throw new Error('offline')
    }))
    expect(sidecarOllamaUrl()).toBe('http://ollama:11434')
    const chat = await resolveOllamaChat(undefined)
    expect(chat.source).toBe('host')
    expect(chat.baseUrl).toBe('http://host.docker.internal:11434')
    expect(chat.host).toEqual({ port: 11434, version: '0.9.0' })
  })

  it('in Docker hits default 11434 via host.docker.internal without docker list or /proc', async () => {
    setAppRunsInDockerForTests(true)
    setDockerPublishedPortsForTests([])
    setHostListenPortsForTests([])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('host.docker.internal:11434/api/version')) {
        return { ok: true, json: async () => ({ version: '0.32.14' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit).toEqual({
      port: 11434,
      version: '0.32.14',
      host: 'host.docker.internal',
      error: null,
      manual: false,
    })
    const called = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(called.some((u) => u.includes('host.docker.internal:11434/api/version'))).toBe(true)
  })

  it('in Docker skips sidecar publish 11435 and still hits host :11434', async () => {
    setAppRunsInDockerForTests(true)
    setDockerPublishedPortsForTests([
      { port: 11435, image: 'ollama/ollama', containerName: '/bros-sc-ollama', project: 'bros-sc-ollama' },
    ])
    setHostListenPortsForTests([])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':11435/api/version')) {
        return { ok: true, json: async () => ({ version: 'sidecar-publish' }) }
      }
      if (String(url).includes('host.docker.internal:11434/api/version')) {
        return { ok: true, json: async () => ({ version: 'host-ok' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit).toEqual({ port: 11434, version: 'host-ok', host: 'host.docker.internal', error: null, manual: false })
    const called = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(called.some((u) => u.includes(':11435/'))).toBe(false)
  })

  it('on host Node probes :11434 even when /proc listen is empty', async () => {
    setAppRunsInDockerForTests(false)
    setDockerPublishedPortsForTests([])
    setHostListenPortsForTests([])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('127.0.0.1:11434/api/version')) {
        return { ok: true, json: async () => ({ version: '0.32.14' }) }
      }
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit).toEqual({ port: 11434, version: '0.32.14', host: '127.0.0.1', error: null, manual: false })
  })

  it('in Docker stays Unreachable when host :11434 has no /api/version', async () => {
    setAppRunsInDockerForTests(true)
    setDockerPublishedPortsForTests([])
    setHostListenPortsForTests([])
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
    const hit = await findHostOllama()
    expect(hit.port).toBeNull()
    const { setHostOllamaEnabled } = await import('../../src/server/utils/hostOllamaSettings')
    const { ensureDefaultProviders } = await import('../../src/server/utils/providers')
    const { buildProvidersView } = await import('../../src/server/utils/providersView')
    ensureDefaultProviders()
    setHostOllamaEnabled(true)
    const view = await buildProvidersView()
    const host = view.providers.find((p) => p.id === 'ollama-host')
    expect(host?.status).toBe('unreachable')
    expect(host?.statusLabel).toBe('Unreachable')
  })

  it('scanHostOllama busts the 30s cache', async () => {
    setHostListenPortsForTests([11434])
    let version = 'first'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':11434/api/version')) {
        return { ok: true, json: async () => ({ version }) }
      }
      throw new Error('offline')
    }))
    expect((await findHostOllama()).version).toBe('first')
    version = 'second'
    expect((await findHostOllama()).version).toBe('first')
    expect((await scanHostOllama()).version).toBe('second')
  })

  it('omits ollama-host from the providers view when the Settings gate is off', async () => {
    const { ensureDefaultProviders } = await import('../../src/server/utils/providers')
    const { isHostOllamaEnabled, setHostOllamaEnabled } = await import('../../src/server/utils/hostOllamaSettings')
    const { buildProvidersView } = await import('../../src/server/utils/providersView')
    ensureDefaultProviders()
    expect(isHostOllamaEnabled()).toBe(false)
    const off = await buildProvidersView()
    expect(off.providers.some((p) => p.id === 'ollama-host')).toBe(false)
    setHostOllamaEnabled(true)
    const on = await buildProvidersView()
    expect(on.providers.some((p) => p.id === 'ollama-host')).toBe(true)
  })

  it('Scan API 404s when host Ollama is disabled', async () => {
    const { scanHostOllamaApi } = await import('../../src/server/utils/ollamaHost')
    await expect(scanHostOllamaApi()).rejects.toMatchObject({ statusCode: 404 })
  })

  it('Scan API returns a hit when enabled', async () => {
    const { setHostOllamaEnabled } = await import('../../src/server/utils/hostOllamaSettings')
    setHostOllamaEnabled(true)
    setHostListenPortsForTests([11434])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes(':11434/api/version')) {
        return { ok: true, json: async () => ({ version: 'scanned' }) }
      }
      throw new Error('offline')
    }))
    const { scanHostOllamaApi } = await import('../../src/server/utils/ollamaHost')
    const result = await scanHostOllamaApi()
    expect(result).toMatchObject({ port: 11434, version: 'scanned' })
  })
})
