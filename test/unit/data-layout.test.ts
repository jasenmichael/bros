import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDataLayout } from '../../src/server/utils/dataLayout'

describe('migrateDataLayout', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('moves app config once and migrates legacy bros.yml to home', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-layout-'))
    const data = join(root, 'data')
    mkdirSync(join(data, 'skills'), { recursive: true })
    mkdirSync(join(data, 'config'), { recursive: true })
    writeFileSync(join(data, 'skills/id'), 'keep\n')
    writeFileSync(join(data, 'config/bros.yml'), 'enable_whisper: false\n')

    migrateDataLayout(data, root)
    migrateDataLayout(data, root)

    expect(readFileSync(join(data, 'config/skills/id'), 'utf8')).toBe('keep\n')
    expect(existsSync(join(data, 'skills/id'))).toBe(false)
    expect(readFileSync(join(root, 'bros.yml'), 'utf8')).toBe('enable_whisper: false\n')
    expect(existsSync(join(data, 'config/bros.yml'))).toBe(false)
  })

  it('removes a Docker-poison directory at legacy bros.yml', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-layout-'))
    const data = join(root, 'data')
    mkdirSync(join(data, 'config/bros.yml'), { recursive: true })
    migrateDataLayout(data, root)
    expect(existsSync(join(data, 'config/bros.yml'))).toBe(false)
  })

  it('replaces an empty destination directory', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-layout-'))
    const data = join(root, 'data')
    mkdirSync(join(data, 'config/skills'), { recursive: true })
    mkdirSync(join(data, 'skills'), { recursive: true })
    writeFileSync(join(data, 'skills/id'), 'keep\n')

    migrateDataLayout(data)

    expect(readFileSync(join(data, 'config/skills/id'), 'utf8')).toBe('keep\n')
    expect(existsSync(join(data, 'skills'))).toBe(false)
  })

  it('leaves a directory it cannot write and does not log it twice', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-layout-'))
    const data = join(root, 'data')
    const src = join(data, 'skills')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'id'), 'keep\n')
    mkdirSync(join(data, 'config/skills'), { recursive: true })
    chmodSync(src, 0o555)
    const err = console.error
    const lines: string[] = []
    console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
    try {
      migrateDataLayout(data)
      migrateDataLayout(data)
      expect(existsSync(join(src, 'id'))).toBe(true)
      expect(readdirSync(join(data, 'config/skills'))).toEqual([])
      expect(lines.filter(line => line.includes('skills to config/skills'))).toHaveLength(1)
    }
    finally {
      console.error = err
      chmodSync(src, 0o755)
    }
  })
})
