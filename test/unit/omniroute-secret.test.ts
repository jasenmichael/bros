import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ensureOmnirouteJwtSecret,
  omnirouteEnvPath,
  parseOmnirouteJwtSecret,
} from '../../src/server/utils/docker-app/omnirouteSecret'

describe('omnirouteSecret', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  function tmp() {
    const root = mkdtempSync(join(tmpdir(), 'bros-omni-'))
    roots.push(root)
    return root
  }

  it('parses OMNIROUTE_JWT_SECRET lines', () => {
    expect(parseOmnirouteJwtSecret('OMNIROUTE_JWT_SECRET=abc\n')).toBe('abc')
    expect(parseOmnirouteJwtSecret('OMNIROUTE_JWT_SECRET="x y"\n')).toBe('x y')
    expect(parseOmnirouteJwtSecret('# comment\n')).toBe('')
  })

  it('writes data .env and removes readable pack .env', () => {
    const dataDir = tmp()
    const packDir = tmp()
    writeFileSync(join(packDir, '.env'), 'OMNIROUTE_JWT_SECRET=from-pack\n', { mode: 0o600 })
    const secret = ensureOmnirouteJwtSecret({ dataDir, packDir, env: {} })
    expect(secret).toBe('from-pack')
    expect(readFileSync(omnirouteEnvPath(dataDir), 'utf8')).toContain('from-pack')
    expect(() => readFileSync(join(packDir, '.env'))).toThrow()
  })

  it('keeps env override and still clears pack .env', () => {
    const dataDir = tmp()
    const packDir = tmp()
    mkdirSync(join(dataDir, 'apps', 'omniroute'), { recursive: true })
    writeFileSync(omnirouteEnvPath(dataDir), 'OMNIROUTE_JWT_SECRET=old\n')
    writeFileSync(join(packDir, '.env'), 'OMNIROUTE_JWT_SECRET=pack\n')
    const secret = ensureOmnirouteJwtSecret({
      dataDir,
      packDir,
      env: { OMNIROUTE_JWT_SECRET: 'from-env' },
    })
    expect(secret).toBe('from-env')
    expect(readFileSync(omnirouteEnvPath(dataDir), 'utf8')).toContain('from-env')
  })

  it('generates when nothing set', () => {
    const dataDir = tmp()
    const secret = ensureOmnirouteJwtSecret({ dataDir, env: {} })
    expect(secret.length).toBeGreaterThan(16)
    expect(readFileSync(omnirouteEnvPath(dataDir), 'utf8')).toContain(secret)
  })
})
