import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { commandEntry, main, startsStack, usageText } from '../../src/cli/index.ts'
import { readStamp, stampMatches, stampOf, writeStampFile } from '../../src/cli/model.ts'

const REPO = join(import.meta.dirname, '../..')

describe('model stamp', () => {
  it('matches when size and mtimeMs match, and misses when they do not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bros-stamp-'))
    const gguf = join(dir, 'bros-q4_k_m.gguf')
    writeFileSync(gguf, 'gguf-bytes')
    const vendor = stampOf(gguf)
    writeStampFile(dir, vendor)
    expect(stampMatches(vendor, readStamp(join(dir, '.bros-gguf-stamp.json')))).toBe(true)
    writeFileSync(gguf, 'gguf-bytes-changed')
    expect(stampMatches(stampOf(gguf), readStamp(join(dir, '.bros-gguf-stamp.json')))).toBe(false)
    expect(stampMatches(vendor, null)).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('citty command config', () => {
  it('is one flat command map, and a one-off does not start the stack', () => {
    const names = Object.keys(main.subCommands || {})
    expect(names).toEqual(expect.arrayContaining([
      'start', 'stop', 'restart', 'status', 'check', 'update', 'upgrade', 'service', 'run', 'shell',
    ]))
    for (const command of Object.values(main.subCommands || {})) {
      expect(command.subCommands).toBeUndefined()
    }
    expect(commandEntry('status')).toBe('oneoff')
    expect(startsStack('status')).toBe(false)
    expect(startsStack('stop')).toBe(false)
    expect(startsStack('check')).toBe(false)
    expect(startsStack('update')).toBe(false)
    expect(startsStack('service')).toBe(false)
    expect(commandEntry('run')).toBe('exec')
    expect(commandEntry('shell')).toBe('exec')
    expect(startsStack('start')).toBe(true)
    expect(startsStack('restart')).toBe(true)
    expect(main.setup).toBeUndefined()
    expect(typeof main.subCommands?.start.setup).toBe('function')
  })
})

describe('help text', () => {
  it('is docs/cli.md with the frontmatter removed', () => {
    const raw = readFileSync(join(REPO, 'docs/cli.md'), 'utf8')
    const text = usageText(raw)
    expect(text.startsWith('---')).toBe(false)
    expect(text).toContain('shell')
    expect(text).toContain('run')
    expect(text).toContain('-D')
    expect(text).toContain('-c')
    expect(text).toContain('-i')
    expect(text).toContain('--verbose')
    const help = execFileSync(join(REPO, 'bros'), ['--help'], { encoding: 'utf8' })
    expect(help.trim()).toBe(text.trim())
  })
})
