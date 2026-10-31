import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appUpdateKind, appsComposeBody, readCatalog } from '../../app/server/utils/cli/packages'
import { duplicateHomePath, ensureHomeDirs, parseHomePaths, resolveWorkspaceHost } from '../../app/server/utils/homePaths'

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

  it('creates listed home directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bros-home-'))
    ensureHomeDirs(dir, ['.config/Cursor', '.cursor', '.local/share/cursor-agent', '.config/cursor'])
    expect(readdirSync(join(dir, 'home', '.config')).sort()).toEqual(['Cursor', 'cursor'])
    expect(readdirSync(join(dir, 'home', '.local', 'share'))).toEqual(['cursor-agent'])
    expect(readdirSync(join(dir, 'home')).sort()).toContain('.cursor')
  })
})

describe('workspace', () => {
  it('uses the host data workspace unless bros.yml or the env var replaces it', () => {
    const prev = process.env.BROS_WORKSPACE
    delete process.env.BROS_WORKSPACE
    expect(resolveWorkspaceHost({ dataDir: '/host/data', appDir: '/host' })).toBe('/host/data/home/workspace')
    expect(resolveWorkspaceHost({ dataDir: '/host/data', appDir: '/host', yaml: '/srv/work' })).toBe('/srv/work')
    process.env.BROS_WORKSPACE = '/override'
    expect(resolveWorkspaceHost({ dataDir: '/host/data', appDir: '/host', yaml: '/srv/work' })).toBe('/override')
    if (prev === undefined) delete process.env.BROS_WORKSPACE
    else process.env.BROS_WORKSPACE = prev
  })
})

describe('app tiers', () => {
  it('seeds an addon disabled and keeps package paths out of apps-compose', () => {
    const catalog = readCatalog()
    const addon = catalog.find((pkg) => pkg.id === 'jq')
    const core = catalog.find((pkg) => pkg.id === 'node')
    expect(addon?.tier).toBe('addon')
    expect(addon?.enabled).toBe(false)
    expect(core?.enabled).toBe(true)
    expect(core?.bin).toBe('node')
    const body = appsComposeBody(catalog)
    expect(body).not.toContain('.config/jq')
    expect(body).not.toContain('.npm')
  })

  it('uses one update action for a package app and a dockerApp app', () => {
    expect(appUpdateKind('npm', [{ id: 'npm' }], ['pi'])).toBe('package')
    expect(appUpdateKind('pi', [{ id: 'npm' }], ['pi'])).toBe('docker')
  })
})
