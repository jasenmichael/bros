import { mkdirSync, mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  destBrosModelDir,
  ensureInternalBrosModel,
  isInternalBrosModel,
  refuseInternalBrosModel,
  resetInternalBrosModelForTests,
  STAMP_NAME,
  vendorGgufPath,
} from '../../app/server/utils/internalBrosModel'

const execInDockerApp = vi.fn(async () => ({ code: 0, stdout: 'created Ollama model bros', stderr: '' }))

vi.mock('../../app/server/utils/docker', () => ({
  execInDockerApp: (...args: unknown[]) => execInDockerApp(...args),
}))

describe('isInternalBrosModel', () => {
  it('matches bros and bros:latest only', () => {
    expect(isInternalBrosModel('bros')).toBe(true)
    expect(isInternalBrosModel('bros:latest')).toBe(true)
    expect(isInternalBrosModel(' llama3.2 ')).toBe(false)
    expect(isInternalBrosModel('bros:0.1')).toBe(false)
  })
})

describe('refuseInternalBrosModel', () => {
  it('throws 400 for reserved names', () => {
    try {
      refuseInternalBrosModel('bros')
      expect.fail('expected throw')
    }
    catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(400)
    }
    try {
      refuseInternalBrosModel('bros:latest')
      expect.fail('expected throw')
    }
    catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(400)
    }
  })

  it('allows llama3.2', () => {
    expect(() => refuseInternalBrosModel('llama3.2')).not.toThrow()
  })
})

describe('listOllamaModels drops bros', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('omits bros and bros:latest from dockerApp and host payloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      models: [
        { name: 'llama3.2' },
        { name: 'bros' },
        { name: 'bros:latest' },
      ],
    }), { status: 200 })))
    const { listOllamaModels } = await import('../../app/server/utils/providers')
    const dockerApp = await listOllamaModels('http://ollama:11434', 'ollama')
    const host = await listOllamaModels('http://host.docker.internal:11434', 'ollama-host')
    expect(dockerApp.map((m) => m.name)).toEqual(['llama3.2'])
    expect(host.map((m) => m.name)).toEqual(['llama3.2'])
    expect(dockerApp.some((m) => m.name.includes('bros'))).toBe(false)
    expect(host.some((m) => m.id.includes('bros'))).toBe(false)
  })
})

describe('ensureInternalBrosModel', () => {
  let root = ''

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bros-internal-model-'))
    process.env.BROS_WORKING_DIR = root
    process.env.BROS_DATA_DIR = join(root, 'data')
    mkdirSync(join(root, 'data'), { recursive: true })
    resetInternalBrosModelForTests()
    execInDockerApp.mockClear()
    execInDockerApp.mockResolvedValue({ code: 0, stdout: 'created Ollama model bros', stderr: '' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetInternalBrosModelForTests()
    if (root) rmSync(root, { recursive: true, force: true })
  })

  function writeVendorGguf() {
    const gguf = vendorGgufPath(root)
    mkdirSync(join(gguf, '..'), { recursive: true })
    writeFileSync(gguf, 'gguf-bytes')
    mkdirSync(join(root, 'vendor/bros-model/ollama'), { recursive: true })
    writeFileSync(join(root, 'vendor/bros-model/ollama/Modelfile'), 'FROM ../models/bros-q4_k_m.gguf\n')
    mkdirSync(join(root, 'vendor/bros-model/scripts'), { recursive: true })
    writeFileSync(join(root, 'vendor/bros-model/scripts/install-ollama.sh'), '#!/bin/bash\n')
    return gguf
  }

  it('skips create when vendor GGUF is missing and does not throw', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(ensureInternalBrosModel()).resolves.toBeUndefined()
      expect(execInDockerApp).not.toHaveBeenCalled()
      expect(err).not.toHaveBeenCalled()
    }
    finally {
      err.mockRestore()
    }
  })

  it('skips exec when tags has bros and stamp matches vendor', async () => {
    const gguf = writeVendorGguf()
    const st = statSync(gguf)
    const dest = destBrosModelDir(join(root, 'data'))
    mkdirSync(dest, { recursive: true })
    writeFileSync(join(dest, STAMP_NAME), JSON.stringify({ size: st.size, mtimeMs: st.mtimeMs }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      models: [{ name: 'bros:latest' }],
    }), { status: 200 })))
    await ensureInternalBrosModel()
    expect(execInDockerApp).not.toHaveBeenCalled()
  })

  it('runs install-ollama.sh from the data dir when vendor is missing', async () => {
    const dest = destBrosModelDir(join(root, 'data'))
    const gguf = join(dest, 'models/bros-q4_k_m.gguf')
    mkdirSync(join(gguf, '..'), { recursive: true })
    writeFileSync(gguf, 'downloaded-gguf')
    mkdirSync(join(dest, 'scripts'), { recursive: true })
    writeFileSync(join(dest, 'scripts/install-ollama.sh'), '#!/bin/bash\n')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      models: [{ name: 'llama3.2' }],
    }), { status: 200 })))
    await ensureInternalBrosModel()
    expect(execInDockerApp).toHaveBeenCalledTimes(1)
    expect(execInDockerApp.mock.calls[0]?.[1]).toEqual(['bash', '/bros-model/scripts/install-ollama.sh'])
  })

  it('copies and runs install-ollama.sh when tags miss', async () => {
    writeVendorGguf()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      models: [{ name: 'llama3.2' }],
    }), { status: 200 })))
    await ensureInternalBrosModel()
    expect(execInDockerApp).toHaveBeenCalledTimes(1)
    expect(execInDockerApp.mock.calls[0]?.[0]).toBe('ollama')
    expect(execInDockerApp.mock.calls[0]?.[1]).toEqual(['bash', '/bros-model/scripts/install-ollama.sh'])
  })
})
