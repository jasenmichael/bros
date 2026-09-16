import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
    expect(getProvider('ollama')?.config).toMatchObject({ mode: 'sidecar', useGpu: true })
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

})
