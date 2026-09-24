import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { seedSidecarData } from '../../src/server/utils/sidecarData'

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
})
