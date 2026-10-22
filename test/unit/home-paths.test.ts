import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { appUpdateKind, appsComposeBody, readCatalog } from '../../src/server/utils/cli/packages'
import { duplicateHomePath, ensureHomeDirs, parseHomePaths, resolveWorkspaceHost } from '../../src/server/utils/homePaths'

describe('desktop home', () => {
  it('rejects a path that escapes the home', () => {
    expect(() => parseHomePaths(['../etc'])).toThrow(/invalid/)
    expect(() => parseHomePaths(['/root'])).toThrow(/invalid/)
  })

  it('fails when two packs claim one path', () => {
    expect(duplicateHomePath([
      { id: 'a', home: ['.cursor'] },
      { id: 'b', home: ['.cursor'] },
    ])).toBe('.cursor')
  })

  it('creates the Cursor and Agent home directories', () => {
    const root = join(import.meta.dirname, '../..')
    const cursor = parseYaml(readFileSync(join(root, 'lib/apps/addon/cursor/config.yml'), 'utf8')) as { home?: string[]; interfaces?: Array<{ type?: string; args?: string }> }
    const agent = parseYaml(readFileSync(join(root, 'lib/apps/addon/agent/config.yml'), 'utf8')) as { home?: string[] }
    expect(cursor.home).toEqual(['.config/Cursor', '.cursor'])
    expect(cursor.interfaces?.find((row) => row.type === 'gui')?.args).toBe('--disable-chromium-sandbox')
    expect(agent.home).toEqual(['.local/share/cursor-agent', '.config/cursor'])
    expect(duplicateHomePath([
      { id: 'cursor', home: cursor.home },
      { id: 'agent', home: agent.home },
    ])).toBeNull()
    const dir = mkdtempSync(join(tmpdir(), 'bros-home-'))
    ensureHomeDirs(dir, [...(cursor.home || []), ...(agent.home || [])])
    expect(readdirSync(join(dir, 'home', '.config')).sort()).toEqual(['Cursor', 'cursor'])
    expect(readdirSync(join(dir, 'home', '.local', 'share'))).toEqual(['cursor-agent'])
    expect(readdirSync(join(dir, 'home')).sort()).toContain('.cursor')
  })
})

describe('workspace', () => {
  it('uses the host data workspace unless bros.yml or the env var replaces it', () => {
    const prev = process.env.BROS_HOST_WORKSPACE
    delete process.env.BROS_HOST_WORKSPACE
    expect(resolveWorkspaceHost({ dataDir: '/host/data', appDir: '/host' })).toBe('/host/data/home/workspace')
    expect(resolveWorkspaceHost({ dataDir: '/host/data', appDir: '/host', yaml: '/srv/work' })).toBe('/srv/work')
    process.env.BROS_HOST_WORKSPACE = '/override'
    expect(resolveWorkspaceHost({ dataDir: '/host/data', appDir: '/host', yaml: '/srv/work' })).toBe('/override')
    if (prev === undefined) delete process.env.BROS_HOST_WORKSPACE
    else process.env.BROS_HOST_WORKSPACE = prev
  })
})

describe('app tiers', () => {
  it('seeds an addon disabled and keeps its home path out of apps-compose', () => {
    const catalog = readCatalog()
    const addon = catalog.find((pkg) => pkg.id === 'jq')
    const core = catalog.find((pkg) => pkg.id === 'npm')
    expect(addon?.tier).toBe('addon')
    expect(addon?.enabled).toBe(false)
    expect(core?.enabled).toBe(true)
    expect(core?.bin).toBe('npm')
    expect(core?.home).toEqual(['.npm', '.local'])
    const body = appsComposeBody(catalog)
    expect(body).not.toContain('.config/jq')
    expect(body).not.toContain('.npm')
  })

  it('uses one update action for a package app and a sidecar app', () => {
    expect(appUpdateKind('npm', [{ id: 'npm' }], ['pi'])).toBe('package')
    expect(appUpdateKind('pi', [{ id: 'npm' }], ['pi'])).toBe('sidecar')
  })
})
