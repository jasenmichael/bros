import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openCodePassword, passwordFromLogs } from '../../src/server/utils/sidecars/opencodePassword'

describe('openCodePassword', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('reads state password before config', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-oc-'))
    mkdirSync(join(root, 'home/.local/state/opencode'), { recursive: true })
    mkdirSync(join(root, 'home/.config/opencode'), { recursive: true })
    writeFileSync(join(root, 'home/.local/state/opencode/service.json'), '{"password":"from-state"}\n')
    writeFileSync(join(root, 'home/.config/opencode/service.json'), '{"server":{"password":"from-config"}}\n')
    expect(openCodePassword(root)).toBe('from-state')
  })

  it('reads a nested config password when state has none', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-oc-'))
    mkdirSync(join(root, 'home/.config/opencode'), { recursive: true })
    writeFileSync(join(root, 'home/.config/opencode/service.json'), '{"server":{"password":"from-config"}}\n')
    expect(openCodePassword(root)).toBe('from-config')
  })

  it('returns null when the files are missing or empty', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-oc-'))
    expect(openCodePassword(root)).toBeNull()
  })

  it('uses the latest server password line', () => {
    expect(passwordFromLogs('server listening\nserver password first\nserver password second\n')).toBe('second')
    expect(passwordFromLogs('no password here')).toBeNull()
  })
})
