import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('upsertProvider config merge', () => {
  let dataDir = ''

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-test-'))
    process.env.BROS_DATA_DIR = dataDir
    process.env.BROS_WORKING_DIR = dataDir
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
    const { resetOllamaHostCache, setDockerPublishedPortsForTests, setHostListenPortsForTests, setOllamaManualPortForTests } = await import('../../src/server/utils/ollamaHost')
    resetOllamaHostCache()
    setOllamaManualPortForTests(null)
    setHostListenPortsForTests([])
    setDockerPublishedPortsForTests([])
  })

  afterEach(async () => {
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
    const { resetOllamaHostCache } = await import('../../src/server/utils/ollamaHost')
    resetOllamaHostCache()
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('keeps useGpu when a later upsert only patches mode', async () => {
    const { upsertProvider, getProvider } = await import('../../src/server/utils/providers')

    upsertProvider({
      id: 'ollama',
      name: 'Ollama',
      kind: 'ollama',
      baseUrl: 'http://ollama:11434',
      config: { mode: 'sidecar', useGpu: true },
    })

    upsertProvider({
      id: 'ollama',
      name: 'Ollama',
      kind: 'ollama',
      baseUrl: 'http://ollama:11434',
      config: { mode: 'external' },
    })

    const row = getProvider('ollama')
    expect(row?.config).toEqual({ mode: 'external', useGpu: true })
  })

  it('persists useGpu true once when GPU is present and preference is unset', async () => {
    const { ensureDefaultUseGpu, getProvider } = await import('../../src/server/utils/providers')

    expect(ensureDefaultUseGpu(true)).toBe(true)
    expect(getProvider('ollama')?.config).toMatchObject({ useGpu: true })
  })

  it('keeps explicit useGpu false when GPU is present', async () => {
    const { ensureDefaultUseGpu, getProvider, upsertProvider } = await import('../../src/server/utils/providers')

    upsertProvider({
      id: 'ollama',
      name: 'Ollama',
      kind: 'ollama',
      baseUrl: 'http://ollama:11434',
      config: { mode: 'sidecar', useGpu: false },
    })

    expect(ensureDefaultUseGpu(true)).toBe(false)
    expect(getProvider('ollama')?.config.useGpu).toBe(false)
  })

  it('does not write useGpu when no GPU and preference is unset', async () => {
    const { ensureDefaultUseGpu, getProvider } = await import('../../src/server/utils/providers')

    expect(ensureDefaultUseGpu(false)).toBe(false)
    expect(getProvider('ollama')?.config.useGpu).toBeUndefined()
  })

  it('leaves saved useGpu true in config when GPU is offline', async () => {
    const { ensureDefaultUseGpu, getProvider, upsertProvider } = await import('../../src/server/utils/providers')

    upsertProvider({
      id: 'ollama',
      name: 'Ollama',
      kind: 'ollama',
      baseUrl: 'http://ollama:11434',
      config: { mode: 'sidecar', useGpu: true },
    })

    expect(ensureDefaultUseGpu(false)).toBe(false)
    expect(getProvider('ollama')?.config.useGpu).toBe(true)
  })

  it('persists custom Ollama names in config.customModels and dedups', async () => {
    const { rememberCustomOllamaModel, listCustomOllamaModels, upsertProvider, getProvider } = await import('../../src/server/utils/providers')

    upsertProvider({
      id: 'ollama',
      name: 'Ollama',
      kind: 'ollama',
      baseUrl: 'http://ollama:11434',
      config: { mode: 'sidecar', useGpu: true },
    })

    expect(rememberCustomOllamaModel('freehuntx/qwen3-coder:14b')).toEqual(['freehuntx/qwen3-coder:14b'])
    expect(rememberCustomOllamaModel('freehuntx/qwen3-coder:14b')).toEqual(['freehuntx/qwen3-coder:14b'])
    expect(rememberCustomOllamaModel('not a name')).toEqual(['freehuntx/qwen3-coder:14b'])
    expect(listCustomOllamaModels()).toEqual(['freehuntx/qwen3-coder:14b'])
    expect(getProvider('ollama')?.config).toMatchObject({
      mode: 'sidecar',
      useGpu: true,
      customModels: ['freehuntx/qwen3-coder:14b'],
    })
  })

  it('seeds sidecar and host system providers and refuses to delete them', async () => {
    const {
      ensureDefaultProviders,
      getProvider,
      deleteProvider,
      isSystemProvider,
    } = await import('../../src/server/utils/providers')

    ensureDefaultProviders()
    expect(getProvider('ollama')?.name).toBe('Ollama (core)')
    expect(getProvider('ollama-host')?.name).toBe('Ollama (host)')
    expect(isSystemProvider('ollama')).toBe(true)
    expect(isSystemProvider('ollama-host')).toBe(true)
    expect(isSystemProvider('my-proxy')).toBe(false)
    expect(() => deleteProvider('ollama')).toThrow(/Cannot delete built-in ollama/)
    expect(() => deleteProvider('ollama-host')).toThrow(/Cannot delete built-in ollama-host/)
  })

  it('migrates stored Ollama sidecar/host names without embedding a port', async () => {
    const { upsertProvider, ensureDefaultProviders, getProvider } = await import('../../src/server/utils/providers')
    upsertProvider({
      id: 'ollama',
      name: 'Ollama sidecar',
      kind: 'ollama',
      baseUrl: 'http://ollama:11434',
    })
    upsertProvider({
      id: 'ollama-host',
      name: 'Ollama host',
      kind: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
    })
    ensureDefaultProviders()
    expect(getProvider('ollama')?.name).toBe('Ollama (core)')
    expect(getProvider('ollama-host')?.name).toBe('Ollama (host)')
  })

  it('stores custom pull names on the host provider when providerId is ollama-host', async () => {
    const { ensureDefaultProviders, rememberCustomOllamaModel, listCustomOllamaModels, getProvider } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    expect(rememberCustomOllamaModel('llama3.2', 'ollama-host')).toEqual(['llama3.2'])
    expect(listCustomOllamaModels('ollama-host')).toEqual(['llama3.2'])
    expect(listCustomOllamaModels('ollama')).toEqual([])
    expect(getProvider('ollama-host')?.config).toMatchObject({ customModels: ['llama3.2'] })
  })

  it('seeds 12 popular OpenAI-compat rows and refuses to delete them', async () => {
    const {
      ensureDefaultProviders,
      getProvider,
      deleteProvider,
      upsertProvider,
    } = await import('../../src/server/utils/providers')
    const { PROVIDER_PRESETS, isPopularProvider } = await import('../../src/server/utils/providerPresets')

    ensureDefaultProviders()
    expect(PROVIDER_PRESETS).toHaveLength(12)
    for (const preset of PROVIDER_PRESETS) {
      const row = getProvider(preset.id)
      expect(row?.kind).toBe('openai')
      expect(row?.name).toBe(preset.name)
      expect(row?.baseUrl).toBe(preset.baseUrl)
      expect(row?.config.models).toEqual(preset.models)
      expect(isPopularProvider(preset.id)).toBe(true)
      expect(() => deleteProvider(preset.id)).toThrow(new RegExp(`Cannot delete built-in ${preset.id}`))
    }
  })

  it('does not clobber a saved popular key or models on re-seed', async () => {
    const { ensureDefaultProviders, getProvider, upsertProvider, getProviderSecret } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    upsertProvider({
      id: 'openai',
      name: 'OpenAI',
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      config: { models: ['gpt-4o-mini'] },
    })
    ensureDefaultProviders()
    expect(getProvider('openai')?.config.models).toEqual(['gpt-4o-mini'])
    expect(getProviderSecret('openai')?.apiKey).toBe('sk-test')
  })

  it('treats popular slugs as reserved so custom cannot reuse openai', async () => {
    const { ensureDefaultProviders, isReservedProviderId } = await import('../../src/server/utils/providers')
    const { isPopularProvider } = await import('../../src/server/utils/providerPresets')
    ensureDefaultProviders()
    expect(isReservedProviderId('openai')).toBe(true)
    expect(isReservedProviderId('gemini')).toBe(true)
    expect(isPopularProvider('my-proxy')).toBe(false)
    expect(isReservedProviderId('my-proxy')).toBe(false)
  })

  it('defaults Ollama Chat on and keyed providers Chat off', async () => {
    const { ensureDefaultProviders, getProvider, setProviderEnabled, upsertProvider, filterChatProviders, isChatSelectionEnabled } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    expect(getProvider('ollama')?.enabled).toBe(true)
    expect(getProvider('ollama-host')?.enabled).toBe(true)
    expect(getProvider('openai')?.enabled).toBe(false)
    expect(isChatSelectionEnabled(getProvider('openai'))).toBe(false)

    await setProviderEnabled('ollama', false)
    expect(getProvider('ollama')?.enabled).toBe(false)
    expect(getProvider('ollama-host')?.enabled).toBe(true)
    expect(getProvider('openai')?.enabled).toBe(false)

    upsertProvider({
      id: 'ollama',
      name: 'Ollama sidecar',
      kind: 'ollama',
      baseUrl: 'http://ollama:11434',
      config: { useGpu: true },
    })
    expect(getProvider('ollama')?.enabled).toBe(false)
    expect(getProvider('ollama')?.config).toMatchObject({ useGpu: true })
    expect(filterChatProviders([
      getProvider('ollama')!,
      getProvider('ollama-host')!,
      getProvider('openai')!,
    ]).map((p) => p.id)).toEqual(['ollama-host'])
  })

  it('setProviderEnabled only flips that provider', async () => {
    const { ensureDefaultProviders, getProvider, setProviderEnabled } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    const sidecarBefore = getProvider('ollama')
    await setProviderEnabled('openai', false)
    await setProviderEnabled('ollama-host', false)
    expect(getProvider('openai')?.enabled).toBe(false)
    expect(getProvider('ollama-host')?.enabled).toBe(false)
    expect(getProvider('ollama')?.enabled).toBe(true)
    expect(getProvider('ollama')?.baseUrl).toBe(sidecarBefore?.baseUrl)
    expect(getProvider('ollama')?.config).toEqual(sidecarBefore?.config)
  })

  it('new custom providers default Chat off', async () => {
    const { upsertProvider, getProvider } = await import('../../src/server/utils/providers')
    upsertProvider({
      id: 'my-proxy',
      name: 'My proxy',
      kind: 'openai',
      baseUrl: 'http://127.0.0.1:8000/v1',
    })
    expect(getProvider('my-proxy')?.enabled).toBe(false)
  })

  it('refuses to enable a keyed provider with no API key', async () => {
    const { ensureDefaultProviders, getProvider, setProviderEnabled } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    await expect(setProviderEnabled('openai', true)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Need an API key',
    })
    expect(getProvider('openai')?.enabled).toBe(false)
    expect(getProvider('ollama')?.enabled).toBe(true)
  })

  it('keeps Chat off when the key probe fails', async () => {
    const { ensureDefaultProviders, getProvider, setProviderEnabled, upsertProvider } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    upsertProvider({
      id: 'openai',
      name: 'OpenAI',
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-bad',
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch
    try {
      await expect(setProviderEnabled('openai', true)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: 'Invalid key',
      })
      expect(getProvider('openai')?.enabled).toBe(false)
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('enables Chat after a successful key probe', async () => {
    const { ensureDefaultProviders, getProvider, setProviderEnabled, upsertProvider } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    upsertProvider({
      id: 'openai',
      name: 'OpenAI',
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-good',
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://api.openai.com/v1/models')
      return new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }), { status: 200 })
    }) as typeof fetch
    try {
      await setProviderEnabled('openai', true)
      expect(getProvider('openai')?.enabled).toBe(true)
      expect(getProvider('groq')?.enabled).toBe(false)
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('auto-enables Chat when a saved key probes healthy', async () => {
    const { ensureDefaultProviders, getProvider, persistProviderAndSyncChat } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ data: [{ id: 'openai/gpt-oss-20b' }] }), { status: 200 })
    }) as typeof fetch
    try {
      await persistProviderAndSyncChat({
        id: 'groq',
        name: 'Groq',
        kind: 'openai',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: 'gsk-good',
      })
      expect(getProvider('groq')?.enabled).toBe(true)
      expect(getProvider('openai')?.enabled).toBe(false)
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('disables leftover Chat-on keyed rows that have no key, and leaves Ollama on', async () => {
    const { ensureDefaultProviders, getProvider, upsertProvider, disableUnhealthyKeyedChat } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    upsertProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      kind: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      enabled: true,
    })
    await disableUnhealthyKeyedChat()
    expect(getProvider('openrouter')?.enabled).toBe(false)
    expect(getProvider('ollama')?.enabled).toBe(true)
    expect(getProvider('ollama-host')?.enabled).toBe(true)
  })

  it('does not persist Chat-off when a keyed Ready row later fails a list probe', async () => {
    const { ensureDefaultProviders, getProvider, upsertProvider, disableUnhealthyKeyedChat } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    upsertProvider({
      id: 'groq',
      name: 'Groq',
      kind: 'openai',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk-good',
      enabled: true,
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error('The operation was aborted due to timeout')
    }) as typeof fetch
    try {
      const health = await disableUnhealthyKeyedChat()
      expect(health.get('groq')?.ok).toBe(false)
      expect(getProvider('groq')?.enabled).toBe(true)
      expect(getProvider('openai')?.enabled).toBe(false)
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('refuses Ollama Chat-on when the endpoint probe fails', async () => {
    const { ensureDefaultProviders, getProvider, setProviderEnabled } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    await setProviderEnabled('ollama-host', false)
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED')
    }) as typeof fetch
    try {
      await expect(setProviderEnabled('ollama-host', true)).rejects.toMatchObject({
        statusCode: 400,
      })
      expect(getProvider('ollama-host')?.enabled).toBe(false)
      expect(getProvider('ollama')?.enabled).toBe(true)
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('turning Chat off does not call sidecar stop', async () => {
    const docker = await import('../../src/server/utils/docker')
    const stop = vi.spyOn(docker, 'stopSidecar')
    const start = vi.spyOn(docker, 'startSidecar')
    const { ensureDefaultProviders, getProvider, setProviderEnabled } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    await setProviderEnabled('ollama', false)
    expect(getProvider('ollama')?.enabled).toBe(false)
    expect(stop).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
    stop.mockRestore()
    start.mockRestore()
  })

  it('persists Ollama disabledModels on that provider only and defaults others on', async () => {
    const {
      ensureDefaultProviders,
      getProvider,
      setOllamaModelChatEnabled,
      listDisabledOllamaModels,
      upsertProvider,
    } = await import('../../src/server/utils/providers')

    ensureDefaultProviders()
    upsertProvider({
      id: 'ollama',
      name: 'Ollama sidecar',
      kind: 'ollama',
      config: { useGpu: true, customModels: ['freehuntx/qwen3-coder:14b'] },
    })

    expect(listDisabledOllamaModels('ollama')).toEqual([])
    expect(setOllamaModelChatEnabled('ollama', 'mistral', false)).toEqual(['mistral'])
    expect(setOllamaModelChatEnabled('ollama', 'qwen', false)).toEqual(['mistral', 'qwen'])
    expect(setOllamaModelChatEnabled('ollama', 'mistral', true)).toEqual(['qwen'])
    expect(getProvider('ollama')?.config).toMatchObject({
      useGpu: true,
      customModels: ['freehuntx/qwen3-coder:14b'],
      disabledModels: ['qwen'],
    })
    expect(listDisabledOllamaModels('ollama-host')).toEqual([])
    expect(getProvider('ollama-host')?.config.disabledModels).toBeUndefined()
  })

  it('persists popular disabledModels on that provider only and defaults others on', async () => {
    const {
      ensureDefaultProviders,
      getProvider,
      setOllamaModelChatEnabled,
      listDisabledOllamaModels,
    } = await import('../../src/server/utils/providers')

    ensureDefaultProviders()
    expect(listDisabledOllamaModels('groq')).toEqual([])
    expect(setOllamaModelChatEnabled('groq', 'whisper-large-v3', false)).toEqual(['whisper-large-v3'])
    expect(setOllamaModelChatEnabled('groq', 'openai/gpt-oss-120b', false)).toEqual([
      'whisper-large-v3',
      'openai/gpt-oss-120b',
    ])
    expect(setOllamaModelChatEnabled('groq', 'whisper-large-v3', true)).toEqual(['openai/gpt-oss-120b'])
    expect(getProvider('groq')?.config.disabledModels).toEqual(['openai/gpt-oss-120b'])
    expect(getProvider('openai')?.config.disabledModels).toBeUndefined()
    expect(listDisabledOllamaModels('openai')).toEqual([])
  })

  it('skips remote GET /models when no API key is saved', async () => {
    const { ensureDefaultProviders, listOpenAIModelIds } = await import('../../src/server/utils/providers')
    const { getProviderPreset } = await import('../../src/server/utils/providerPresets')
    ensureDefaultProviders()
    const originalFetch = globalThis.fetch
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    try {
      const ids = await listOpenAIModelIds('openai')
      expect(ids).toEqual(getProviderPreset('openai')?.models)
      expect(fetchMock).not.toHaveBeenCalled()
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

})
