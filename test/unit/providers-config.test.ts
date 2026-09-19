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
  })

  afterEach(async () => {
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
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
    expect(getProvider('ollama')?.name).toBe('Ollama sidecar')
    expect(getProvider('ollama-host')?.name).toBe('Ollama host')
    expect(isSystemProvider('ollama')).toBe(true)
    expect(isSystemProvider('ollama-host')).toBe(true)
    expect(isSystemProvider('my-proxy')).toBe(false)
    expect(() => deleteProvider('ollama')).toThrow(/Cannot delete built-in ollama/)
    expect(() => deleteProvider('ollama-host')).toThrow(/Cannot delete built-in ollama-host/)
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
      isPopularProvider,
    } = await import('../../src/server/utils/providers')
    const { PROVIDER_PRESETS } = await import('../../src/server/utils/providerPresets')

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
    const { ensureDefaultProviders, isReservedProviderId, isPopularProvider } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    expect(isReservedProviderId('openai')).toBe(true)
    expect(isReservedProviderId('gemini')).toBe(true)
    expect(isPopularProvider('my-proxy')).toBe(false)
    expect(isReservedProviderId('my-proxy')).toBe(false)
  })

  it('defaults enabled and keeps it when later upserts omit the flag', async () => {
    const { ensureDefaultProviders, getProvider, setProviderEnabled, upsertProvider, filterChatProviders, isChatSelectionEnabled } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    expect(getProvider('ollama')?.enabled).toBe(true)
    expect(getProvider('ollama-host')?.enabled).toBe(true)
    expect(getProvider('openai')?.enabled).toBe(true)
    expect(isChatSelectionEnabled(getProvider('openai'))).toBe(true)

    setProviderEnabled('ollama', false)
    expect(getProvider('ollama')?.enabled).toBe(false)
    expect(getProvider('ollama-host')?.enabled).toBe(true)
    expect(getProvider('openai')?.enabled).toBe(true)

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
    ]).map((p) => p.id)).toEqual(['ollama-host', 'openai'])
  })

  it('setProviderEnabled only flips that provider', async () => {
    const { ensureDefaultProviders, getProvider, setProviderEnabled } = await import('../../src/server/utils/providers')
    ensureDefaultProviders()
    const sidecarBefore = getProvider('ollama')
    setProviderEnabled('openai', false)
    setProviderEnabled('ollama-host', false)
    expect(getProvider('openai')?.enabled).toBe(false)
    expect(getProvider('ollama-host')?.enabled).toBe(false)
    expect(getProvider('ollama')?.enabled).toBe(true)
    expect(getProvider('ollama')?.baseUrl).toBe(sidecarBefore?.baseUrl)
    expect(getProvider('ollama')?.config).toEqual(sidecarBefore?.config)
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
