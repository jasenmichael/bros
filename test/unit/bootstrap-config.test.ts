import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureDataLayout, loadBootstrapConfig, shouldAutostartFromPublicUrl } from '../../src/server/utils/config'

const ENV_KEYS = ['BROS_CONFIG', 'BROS_WORKING_DIR', 'BROS_DATA_DIR', 'BROS_PUBLIC_URL'] as const

describe('loadBootstrapConfig', () => {
  const saved: Record<string, string | undefined> = {}
  let root = ''

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    root = mkdtempSync(join(tmpdir(), 'bros-boot-'))
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('uses BROS_WORKING_DIR and BROS_DATA_DIR over search roots', () => {
    const working = join(root, 'work')
    const data = join(root, 'data-env')
    process.env.BROS_WORKING_DIR = working
    process.env.BROS_DATA_DIR = data
    const cfg = loadBootstrapConfig(root)
    expect(cfg.workingDir).toBe(resolve(working))
    expect(cfg.dataDir).toBe(resolve(data))
  })

  it('reads exclusive BROS_CONFIG yaml', () => {
    writeFileSync(join(root, 'bros.yml'), 'working_dir: .\ndata_dir: ./from-default\n')
    const exclusive = join(root, 'only.yml')
    writeFileSync(exclusive, 'working_dir: .\ndata_dir: ./from-exclusive\n')
    process.env.BROS_CONFIG = exclusive
    const cfg = loadBootstrapConfig(root)
    expect(cfg.workingDir).toBe(resolve(root))
    expect(cfg.dataDir).toBe(resolve(root, 'from-exclusive'))
  })

  it('reads public_url from yaml', () => {
    writeFileSync(join(root, 'bros.yml'), 'working_dir: .\ndata_dir: ./data\npublic_url: "https://bros.example.com"\n')
    const cfg = loadBootstrapConfig(root)
    expect(cfg.publicUrl).toBe('https://bros.example.com')
    expect(shouldAutostartFromPublicUrl(cfg.publicUrl)).toBe(true)
  })

  it('treats missing or empty public_url as unset', () => {
    writeFileSync(join(root, 'bros.yml'), 'working_dir: .\ndata_dir: ./data\npublic_url: ""\n')
    expect(loadBootstrapConfig(root).publicUrl).toBeNull()
    expect(shouldAutostartFromPublicUrl(null)).toBe(false)
    expect(shouldAutostartFromPublicUrl('   ')).toBe(false)
  })

  it('uses BROS_PUBLIC_URL over yaml', () => {
    writeFileSync(join(root, 'bros.yml'), 'working_dir: .\ndata_dir: ./data\npublic_url: "https://from-yaml.example"\n')
    process.env.BROS_PUBLIC_URL = 'https://from-env.example'
    expect(loadBootstrapConfig(root).publicUrl).toBe('https://from-env.example')
  })
})

describe('ensureDataLayout', () => {
  it('creates sidecars and logs under the data dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bros-data-'))
    try {
      ensureDataLayout(dir)
      expect(existsSync(join(dir, 'sidecars'))).toBe(true)
      expect(existsSync(join(dir, 'logs'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
