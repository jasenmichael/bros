import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureDataLayout, hostDataDirForBinds, loadBootstrapConfig, shouldAutostartFromPublicUrl } from '../../src/server/utils/config'

const ENV_KEYS = ['BROS_CONFIG', 'BROS_WORKING_DIR', 'BROS_DATA_DIR', 'BROS_PUBLIC_URL', 'BROS_HOST_DATA_DIR', 'BROS_HOME', 'BROS_DIR'] as const

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

  it('uses BROS_DIR and BROS_DATA_DIR', () => {
    const app = join(root, 'app')
    const data = join(root, 'data-env')
    mkdirSync(app, { recursive: true })
    process.env.BROS_DIR = app
    process.env.BROS_DATA_DIR = data
    const cfg = loadBootstrapConfig(root)
    expect(cfg.workingDir).toBe(resolve(app))
    expect(cfg.dataDir).toBe(resolve(data))
  })

  it('reads only $BROS_DIR/bros.yml', () => {
    const app = join(root, 'checkout')
    mkdirSync(app, { recursive: true })
    writeFileSync(join(app, 'bros.yml'), 'public_url: "https://bros.example.com"\nenable_host_ollama: true\n')
    writeFileSync(join(root, 'bros.yml'), 'public_url: "https://ignored.example"\n')
    process.env.BROS_DIR = app
    const cfg = loadBootstrapConfig(root)
    expect(cfg.workingDir).toBe(resolve(app))
    expect(cfg.dataDir).toBe(resolve(app, 'data'))
    expect(cfg.publicUrl).toBe('https://bros.example.com')
    expect(cfg.enableHostOllama).toBe(true)
    expect(cfg.enableWhisper).toBe(false)
  })

  it('reads public_url from yaml', () => {
    writeFileSync(join(root, 'bros.yml'), 'public_url: "https://bros.example.com"\n')
    const cfg = loadBootstrapConfig(root)
    expect(cfg.publicUrl).toBe('https://bros.example.com')
    expect(shouldAutostartFromPublicUrl(cfg.publicUrl)).toBe(true)
  })

  it('treats missing or empty public_url as unset', () => {
    writeFileSync(join(root, 'bros.yml'), 'public_url: ""\n')
    expect(loadBootstrapConfig(root).publicUrl).toBeNull()
    expect(shouldAutostartFromPublicUrl(null)).toBe(false)
    expect(shouldAutostartFromPublicUrl('   ')).toBe(false)
  })

  it('uses BROS_PUBLIC_URL over yaml', () => {
    writeFileSync(join(root, 'bros.yml'), 'public_url: "https://from-yaml.example"\n')
    process.env.BROS_PUBLIC_URL = 'https://from-env.example'
    expect(loadBootstrapConfig(root).publicUrl).toBe('https://from-env.example')
  })

  it('from src/app cwd, uses checkout bros.yml data_dir (not src/app/data)', () => {
    writeFileSync(join(root, 'bros.yml'), 'public_url: ""\n')
    const appCwd = join(root, 'src', 'app')
    mkdirSync(appCwd, { recursive: true })
    const cfg = loadBootstrapConfig(appCwd)
    expect(cfg.workingDir).toBe(resolve(root))
    expect(cfg.dataDir).toBe(resolve(root, 'data'))
  })
})

describe('hostDataDirForBinds', () => {
  const saved: Record<string, string | undefined> = {}
  let root = ''

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    root = mkdtempSync(join(tmpdir(), 'bros-host-data-'))
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('prefers BROS_HOST_DATA_DIR over yaml data_dir', () => {
    process.env.BROS_HOST_DATA_DIR = join(root, 'host-data')
    process.env.BROS_DATA_DIR = join(root, 'container-data')
    expect(hostDataDirForBinds()).toBe(resolve(root, 'host-data'))
  })

  it('ignores in-container /app/data and uses BROS_DIR/data', () => {
    process.env.BROS_HOST_DATA_DIR = '/app/data'
    process.env.BROS_DIR = root
    expect(hostDataDirForBinds()).toBe(resolve(root, 'data'))
  })

  it('falls back to BROS_DATA_DIR when that is a host path', () => {
    process.env.BROS_DATA_DIR = join(root, 'from-data-dir')
    process.env.BROS_DIR = root
    expect(hostDataDirForBinds()).toBe(resolve(root, 'from-data-dir'))
  })
})

describe('ensureDataLayout', () => {
  it('creates logs and tunnel under the data dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bros-data-'))
    try {
      ensureDataLayout(dir)
      expect(existsSync(join(dir, 'sidecars'))).toBe(false)
      expect(existsSync(join(dir, 'sidecar-repos'))).toBe(false)
      expect(existsSync(join(dir, 'logs'))).toBe(true)
      expect(existsSync(join(dir, 'tunnel'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
