import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DESKTOP_SIDECAR_ID, defaultSidecarAutostart, shouldAutostartSidecar } from '../../src/server/utils/sidecars/sidecars'
import { packageUpdateAction, parseCliPackage, seedCliPackages, cliApplyAction } from '../../src/server/utils/cli/packages'
import { parseVersionText, versionCommand } from '../../src/server/utils/cli/versionProbe'
import { managerForms } from '../../src/server/utils/cli/managers'
import { debTracksLatest } from '../../src/server/utils/cli/managers/deb'
import { debCachePath, debTracksLatest as debTracksLatestInstall, releaseKey } from '../../lib/sidecars/core/desktop/managers/deb.mjs'
import { run, runCacheDir } from '../../lib/sidecars/core/desktop/managers/run.mjs'
import { nixPrefix, nixSuggestionNames, npmSuggestionNames, readNixSearchConfig } from '../../src/server/utils/cli/managers/search'

describe('cli packages', () => {
  it('seeds nothing and accepts npm, nix, apt, and curl installs', () => {
    expect(seedCliPackages()).toEqual([])
    const forms = managerForms()
    expect(forms.map((row) => row.kind)).toEqual(['npm', 'pnpm', 'bun', 'deno', 'nix', 'apt', 'deb', 'run'])
    expect(forms.find((row) => row.kind === 'nix')?.suggest).toBe(true)
    expect(forms.find((row) => row.kind === 'pnpm')?.suggest).toBe(false)
    expect(forms.every((row) => typeof row.suggest === 'boolean')).toBe(true)
    expect(parseCliPackage({ kind: 'npm', spec: 'typescript', args: '--ignore-scripts' })).toMatchObject({
      id: 'typescript',
      args: '--ignore-scripts',
    })
    expect(parseCliPackage({ kind: 'nix', spec: 'ripgrep' })).toMatchObject({ kind: 'nix', spec: 'ripgrep', bin: 'ripgrep' })
    expect(parseCliPackage({ kind: 'nix', spec: 'nixpkgs#hello' })).toMatchObject({ spec: 'nixpkgs#hello', bin: 'hello' })
    expect(parseCliPackage({ kind: 'pnpm', spec: 'typescript' })).toMatchObject({ kind: 'pnpm', bin: 'typescript' })
    expect(parseCliPackage({ kind: 'bun', spec: 'typescript' })).toMatchObject({ kind: 'bun', bin: 'typescript' })
    expect(parseCliPackage({ kind: 'deno', spec: 'npm:cowsay' })).toMatchObject({ kind: 'deno', bin: 'cowsay' })
    expect(parseCliPackage({ kind: 'apt', spec: 'ripgrep' })).toMatchObject({ kind: 'apt', spec: 'ripgrep', bin: 'ripgrep' })
    expect(parseCliPackage({ kind: 'deb', spec: 'https://example.com/app.deb' }).bin).toBeUndefined()
    expect(parseCliPackage({
      kind: 'deb',
      spec: 'https://api2.cursor.sh/updates/download/golden/linux-x64-deb/cursor/latest',
      interfaces: [{ type: 'gui', command: 'cursor' }],
    }).interfaces).toEqual([{ type: 'gui', command: 'cursor' }])
    expect(parseCliPackage({ kind: 'npm', spec: 'typescript', clis: 'tsserver, tsserver' })).toMatchObject({
      bin: 'typescript',
      clis: ['tsserver'],
    })
    expect(parseCliPackage({ kind: 'run', spec: 'curl -fsSL https://example.com/install | bash', bin: 'demo' }).bin).toBe('demo')
    expect(parseCliPackage({ kind: 'run', spec: 'curl -fsSL https://example.com/install | bash' }).bin).toBeUndefined()
    expect(parseCliPackage({
      kind: 'npm',
      spec: 'typescript',
      interfaces: [{ type: 'cli', command: 'tsc, tsserver' }],
    })).toMatchObject({ bin: 'tsc', clis: ['tsserver'] })
    expect(parseCliPackage({
      kind: 'apt',
      spec: 'gimp',
      interfaces: [{ type: 'gui', command: 'gimp', args: '--fullscreen' }],
    }).interfaces).toEqual([{ type: 'gui', command: 'gimp', args: '--fullscreen' }])
    expect(parseCliPackage({
      kind: 'apt',
      spec: 'gimp',
      interfaces: [{ type: 'gui', command: 'gimp' }, { type: 'api', containerPort: 8081, basePath: '/v1' }],
    }).interfaces).toEqual([
      { type: 'gui', command: 'gimp' },
      { type: 'api', containerPort: 8081, basePath: '/v1' },
    ])
  })

  it('rejects a shell command that is not curl or wget', () => {
    expect(() => parseCliPackage({ kind: 'run', spec: 'rm -rf /', bin: 'x' })).toThrow(/curl or wget/)
    expect(() => parseCliPackage({ kind: 'npm', spec: 'pkg; rm' })).toThrow(/package name/)
    expect(() => parseCliPackage({ kind: 'npm', spec: 'typescript', args: '; rm' })).toThrow(/flags/)
    expect(() => parseCliPackage({ kind: 'nix', spec: 'hello', args: '--impure' })).toThrow(/only for npm/)
    expect(() => parseCliPackage({ kind: 'run', spec: 'curl -fsSL https://example.com/install | bash', bin: 'demo', args: '--foo' })).toThrow(/only for npm/)
    expect(() => parseCliPackage({ kind: 'npm', spec: 'typescript', clis: 'bad name' })).toThrow(/cli name/)
    expect(() => parseCliPackage({ kind: 'apt', spec: 'gimp', interfaces: [{ type: 'gui' }] })).toThrow(/command/)
    expect(() => parseCliPackage({ kind: 'apt', spec: 'gimp', interfaces: [{ type: 'gui', command: 'gimp', publish: 6080 }] })).toThrow(/publish/)
    expect(parseCliPackage({ kind: 'apt', spec: 'gimp', volumes: '/data/gimp:/workspace/gimp' }).volumes).toEqual(['/data/gimp:/workspace/gimp'])
    expect(() => parseCliPackage({ kind: 'apt', spec: 'gimp', volumes: 'not a volume' })).toThrow(/host:container/)
    expect(() => parseCliPackage({ kind: 'deb', spec: 'ripgrep' })).toThrow(/https URL/)
    expect(() => parseCliPackage({ kind: 'deb', spec: 'http://example.com/a.deb' })).toThrow(/https URL/)
    expect(() => parseCliPackage({ kind: 'deb', spec: 'https://user:pass@example.com/a.deb' })).toThrow(/https URL/)
    expect(() => parseCliPackage({ kind: 'deb', spec: 'https://example.com/a.deb', args: '--foo' })).toThrow(/only for npm/)
  })

  it('checks a deb URL for updates only when a path segment is latest', () => {
    const pinned = 'https://downloads.cursor.com/production/abc/cursor_1.0_amd64.deb'
    const latest = 'https://api2.cursor.sh/updates/download/golden/linux-x64-deb/cursor/latest'
    expect(debTracksLatest(pinned)).toBe(false)
    expect(debTracksLatest(latest)).toBe(true)
    expect(debTracksLatestInstall(latest)).toBe(true)
    expect(releaseKey([
      latest,
      'https://downloads.cursor.com/production/abc/linux/x64/deb/amd64/deb/cursor_1.0_amd64.deb',
    ])).toBe('https://downloads.cursor.com/production/abc/linux/x64/deb/amd64/deb/cursor_1.0_amd64.deb')
    expect(releaseKey([
      'https://github.com/cli/cli/releases/latest/download/gh.deb',
      'https://github.com/cli/cli/releases/download/v2.1.0/gh.deb',
      'https://release-assets.githubusercontent.com/asset/gh.deb?jwt=rotating',
    ])).toBe('https://github.com/cli/cli/releases/download/v2.1.0/gh.deb')
    const moved = releaseKey([
      latest,
      'https://downloads.cursor.com/production/def/linux/x64/deb/amd64/deb/cursor_2.0_amd64.deb',
    ])
    expect(moved).not.toBe(releaseKey([latest, 'https://downloads.cursor.com/production/abc/linux/x64/deb/amd64/deb/cursor_1.0_amd64.deb']))
  })

  it('reads npm and nix suggestion payloads', () => {
    expect(npmSuggestionNames({ objects: [{ package: { name: 'pnpm' } }, { package: {} }] })).toEqual(['pnpm'])
    expect(nixSuggestionNames({ hits: { hits: [{ _source: { package_attr_name: 'ripgrep' } }] } })).toEqual(['ripgrep'])
    expect(nixPrefix('nixpkgs#RipGrep!')).toBe('ripgrep')
    expect(readNixSearchConfig('elasticsearchUsername:"u" elasticsearchPassword:"p" elasticsearchMappingSchemaVersion:parseInt("51")')).toEqual({
      user: 'u',
      pass: 'p',
      version: '51',
    })
  })

  it('installs core apt tools from core-apt.yml, including unzip', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../lib/sidecars/core/desktop')
    const utils = readFileSync(join(dir, 'core-apt.yml'), 'utf8')
    expect(utils).toMatch(/name: unzip/)
    expect(utils).toMatch(/clis: unzip, funzip, unzipsfx, zipgrep, zipinfo/)
    expect(readFileSync(join(dir, 'Dockerfile'), 'utf8')).toContain('core-apt.yml')
  })

  it('always autostarts the core CLI sidecar', () => {
    expect(DESKTOP_SIDECAR_ID).toBe('desktop')
    expect(defaultSidecarAutostart('desktop')).toBe(true)
    expect(defaultSidecarAutostart('opencode')).toBe(false)
    expect(defaultSidecarAutostart('mine')).toBe(false)
    expect(shouldAutostartSidecar({ id: 'desktop', disabled: true }, { autostart: false })).toBe(true)
    expect(shouldAutostartSidecar({ id: 'opencode' }, { autostart: false })).toBe(false)
    expect(shouldAutostartSidecar({ id: 'opencode' }, { autostart: true })).toBe(true)
  })

  it('caches a deb by release key and skips curl when that run tree exists', () => {
    const key = 'https://downloads.cursor.com/stable/cursor.deb'
    expect(debCachePath('cursor', key)).toContain('downloads.cursor.com_stable_cursor.deb')
    const root = mkdtempSync(join(tmpdir(), 'bros-run-'))
    const spec = 'curl https://example.com/install -fsS | bash'
    const dir = runCacheDir(root, 'agent', spec, '')
    mkdirSync(join(dir, '.local', 'bin'), { recursive: true })
    writeFileSync(join(dir, '.local', 'bin', 'agent'), 'bin')
    const calls: string[] = []
    const ctx = {
      imageInstall: true,
      cacheRoot: root,
      pkgRoot: join(root, 'pkg'),
      q: (value: string) => `'${String(value).replace(/'/g, `'\\''`)}'`,
      sh(cmd: string) { calls.push(cmd); return true },
    }
    expect(run.apply({ id: 'agent', spec, bin: 'agent', clis: ['cursor-agent'], force: '' }, ctx)).toBe(true)
    expect(calls.some((cmd) => cmd.includes(spec))).toBe(false)
    expect(runCacheDir(root, 'agent', spec, '2')).not.toBe(dir)
    expect(run.apply({ id: 'agent', spec, bin: 'agent', force: '2' }, ctx)).toBe(true)
    expect(calls.some((cmd) => cmd.includes(spec))).toBe(true)
  })

  it('parses an installed version and rebuilds a run update', () => {
    expect(versionCommand({ id: 'agent', kind: 'run', spec: 'curl https://example.com/install | bash' })).toBeNull()
    expect(versionCommand({ id: 'npm', kind: 'npm', spec: 'npm', bin: 'npm' })).toBe('npm --version')
    expect(parseVersionText('apt', 'jq', '1.7.1-3')).toBe('1.7.1-3')
    expect(parseVersionText('npm', 'typescript', '/usr/local/lib\n└── typescript@5.4.5\n')).toBe('5.4.5')
    expect(packageUpdateAction('run')).toBe('rebuild')
    expect(packageUpdateAction('deb')).toBe('exec')
    expect(packageUpdateAction('npm')).toBe('exec')
  })

  it('rebuilds a package change instead of installing into the running container', () => {
    expect(cliApplyAction(false, false)).toBe('start')
    expect(cliApplyAction(false, true)).toBe('start')
    expect(cliApplyAction(true, false)).toBe('skip')
    expect(cliApplyAction(true, true)).toBe('recreate')
    expect(cliApplyAction(true, false, true)).toBe('recreate')
  })
})
