import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateSidecarDataLayout, seedSidecarData } from '../../src/server/utils/sidecarData'

describe('sidecar data layout', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('copies seed files only when the volume path is missing', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-seed-'))
    const pkg = join(root, 'pkg')
    const volume = join(root, 'volume')
    mkdirSync(join(pkg, 'data', 'root', '.config'), { recursive: true })
    writeFileSync(join(pkg, 'data', 'root', '.config', 'app.json'), '{"from":"seed"}\n')
    writeFileSync(join(pkg, 'data', 'readme.txt'), 'seed\n')

    seedSidecarData(pkg, volume)
    expect(readFileSync(join(volume, 'root', '.config', 'app.json'), 'utf8')).toContain('seed')
    expect(readFileSync(join(volume, 'readme.txt'), 'utf8')).toBe('seed\n')

    writeFileSync(join(volume, 'readme.txt'), 'kept\n')
    writeFileSync(join(pkg, 'data', 'readme.txt'), 'newer\n')
    writeFileSync(join(pkg, 'data', 'extra.txt'), 'added\n')
    seedSidecarData(pkg, volume)
    expect(readFileSync(join(volume, 'readme.txt'), 'utf8')).toBe('kept\n')
    expect(readFileSync(join(volume, 'extra.txt'), 'utf8')).toBe('added\n')
  })

  it('nests an old ollama volume under root/.ollama and moves sibling binds', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-migrate-'))
    const data = join(root, 'data')
    const sidecars = join(root, 'sidecars')
    mkdirSync(join(data, 'ollama', 'models'), { recursive: true })
    writeFileSync(join(data, 'ollama', 'models', 'blob'), 'model')
    mkdirSync(join(data, 'ollama-config'), { recursive: true })
    writeFileSync(join(data, 'ollama-config', 'config.json'), '{}')
    mkdirSync(join(data, 'bros-model'), { recursive: true })
    writeFileSync(join(data, 'bros-model', 'stamp'), '1')
    mkdirSync(join(data, 'sidecars', 'mine'), { recursive: true })
    writeFileSync(join(data, 'sidecars', 'mine', 'sidecar.yml'), 'id: mine\n')
    mkdirSync(join(sidecars, 'custom', 'kept'), { recursive: true })
    writeFileSync(join(sidecars, 'custom', 'kept', 'sidecar.yml'), 'id: kept\n')
    mkdirSync(join(data, 'sidecar-repos', 'kept'), { recursive: true })
    writeFileSync(join(data, 'sidecar-repos', 'kept', 'README'), 'leave')

    migrateSidecarDataLayout(data, sidecars)

    expect(readFileSync(join(data, 'ollama', 'root', '.ollama', 'models', 'blob'), 'utf8')).toBe('model')
    expect(existsSync(join(data, 'ollama', 'models'))).toBe(false)
    expect(readFileSync(join(data, 'ollama', 'root', '.config', 'ollama', 'config.json'), 'utf8')).toBe('{}')
    expect(readFileSync(join(data, 'ollama', 'bros-model', 'stamp'), 'utf8')).toBe('1')
    expect(readFileSync(join(sidecars, 'custom', 'mine', 'sidecar.yml'), 'utf8')).toContain('id: mine')
    expect(readFileSync(join(sidecars, 'custom', 'kept', 'sidecar.yml'), 'utf8')).toContain('id: kept')
    expect(existsSync(join(data, 'sidecar-repos', 'kept', 'README'))).toBe(true)

    writeFileSync(join(data, 'ollama', 'root', '.ollama', 'models', 'blob'), 'stay')
    mkdirSync(join(data, 'ollama', 'models'), { recursive: true })
    writeFileSync(join(data, 'ollama', 'models', 'other'), 'nope')
    migrateSidecarDataLayout(data, sidecars)
    expect(readFileSync(join(data, 'ollama', 'root', '.ollama', 'models', 'blob'), 'utf8')).toBe('stay')
  })

  it('moves into an empty destination left by a failed copy', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-migrate-empty-'))
    const data = join(root, 'data')
    const sidecars = join(root, 'sidecars')
    mkdirSync(join(data, 'firecrawl-redis'), { recursive: true })
    writeFileSync(join(data, 'firecrawl-redis', 'dump.rdb'), 'rdb')
    mkdirSync(join(data, 'firecrawl', 'data'), { recursive: true })

    migrateSidecarDataLayout(data, sidecars)

    expect(readFileSync(join(data, 'firecrawl', 'data', 'dump.rdb'), 'utf8')).toBe('rdb')
    expect(existsSync(join(data, 'firecrawl-redis'))).toBe(false)
  })
})
