import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultDockerAppAutostart, shouldAutostartDockerApp } from '../../app/server/utils/docker-app/dockerApps'
import { claimDirArgs, enableAddonApp, packageUpdateAction, parseCliPackage, readCliPackages, readStoredPackages, seedCliPackages, cliApplyAction, updateCommand, writeCliPackages } from '../../app/server/utils/cli/packages'
import { buildVersionScript, nodePin, nodeUpdateAvailable, parseVersionScriptOutput, parseVersionText, versionCommand, versionShell } from '../../app/server/utils/cli/versionProbe'
import { managerForms } from '../../app/server/utils/cli/managers'
import { debTracksLatest } from '../../app/server/utils/cli/managers/deb'
import { debCachePath, debTracksLatest as debTracksLatestInstall, releaseKey } from '../../lib/desktop/managers/deb.ts'
import { run, runCacheDir } from '../../lib/desktop/managers/run.ts'
import { nixPrefix, nixSuggestionNames, npmSuggestionNames, readNixSearchConfig } from '../../app/server/utils/cli/managers/search'

describe('cli packages', () => {
  it('seeds nothing and accepts npm, nix, apt, and curl installs', () => {
    expect(seedCliPackages()).toEqual([])
    const forms = managerForms()
    expect(forms.map((row) => row.kind)).toEqual(['npm', 'pnpm', 'bun', 'deno', 'uv', 'cargo', 'nix', 'apt', 'deb', 'run'])
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
    expect(parseCliPackage({ kind: 'uv', spec: 'ruff' })).toMatchObject({ kind: 'uv', bin: 'ruff' })
    expect(parseCliPackage({ kind: 'uv', spec: 'ruff==0.6.8' })).toMatchObject({ kind: 'uv', spec: 'ruff==0.6.8', bin: 'ruff' })
    expect(parseCliPackage({ kind: 'cargo', spec: 'ripgrep' })).toMatchObject({ kind: 'cargo', bin: 'ripgrep' })
    expect(parseCliPackage({ kind: 'cargo', spec: 'ripgrep@14.1.0' })).toMatchObject({ spec: 'ripgrep@14.1.0', bin: 'ripgrep' })
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
    expect(() => parseCliPackage({ kind: 'uv', spec: 'git+https://example.com/ruff' })).toThrow(/package name/)
    expect(() => parseCliPackage({ kind: 'uv', spec: 'ruff[extra]' })).toThrow(/package name/)
    expect(() => parseCliPackage({ kind: 'cargo', spec: 'git+https://github.com/BurntSushi/ripgrep' })).toThrow(/package name/)
    expect(() => parseCliPackage({ kind: 'cargo', spec: 'ripgrep', args: '--locked' })).toThrow(/only for npm/)
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
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../lib/desktop')
    const utils = readFileSync(join(dir, 'core-apt.yml'), 'utf8')
    expect(utils).toMatch(/name: unzip/)
    expect(utils).toMatch(/clis: unzip, funzip, unzipsfx, zipgrep, zipinfo/)
    expect(readFileSync(join(dir, 'Dockerfile'), 'utf8')).toContain('core-apt.yml')
  })

  it('autostarts Ollama always; other docker apps follow SQLite autostart', () => {
    expect(defaultDockerAppAutostart('ollama')).toBe(true)
    expect(defaultDockerAppAutostart('whisper')).toBe(false)
    expect(defaultDockerAppAutostart('opencode')).toBe(false)
    expect(defaultDockerAppAutostart('mine')).toBe(false)
    expect(shouldAutostartDockerApp({ id: 'ollama', disabled: true }, { autostart: false })).toBe(true)
    expect(shouldAutostartDockerApp({ id: 'whisper' }, { autostart: true })).toBe(false)
    expect(shouldAutostartDockerApp({ id: 'opencode' }, { autostart: false })).toBe(false)
    expect(shouldAutostartDockerApp({ id: 'opencode' }, { autostart: true })).toBe(true)
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
    expect(versionCommand({ id: 'paperclip', kind: 'npm', spec: 'paperclipai', bin: 'paperclipai' })).toBe(`'paperclipai' --version 2>/dev/null || 'paperclipai' -V`)
    expect(parseVersionText('npm', 'paperclipai', 'paperclipai 2026.720.0\n')).toBe('2026.720.0')
    expect(updateCommand({ id: 'paperclip', kind: 'npm', spec: 'paperclipai', bin: 'paperclipai' })).toEqual(['npm', 'update', '-g', '--prefix', '/home/bros/.local', 'paperclipai'])
    expect(versionCommand({ id: 'agent', kind: 'run', spec: 'curl https://example.com/install | bash' })).toBeNull()
    expect(versionCommand({ id: 'agent', kind: 'run', spec: 'curl https://example.com/install | bash', bin: 'agent', version: 'agent version' })).toBe('agent version')
    expect(versionCommand({ id: 'npm', kind: 'npm', spec: 'npm', bin: 'npm' })).toBe(`'npm' --version 2>/dev/null || 'npm' -V`)
    expect(versionCommand({ id: 'node', kind: 'nix', spec: 'nodejs', bin: 'node' })).toBe(`'node' --version 2>/dev/null || 'node' -V`)
    expect(versionCommand({ id: 'ripgrep', kind: 'nix', spec: 'nixpkgs#ripgrep' })).toBe(`'ripgrep' --version 2>/dev/null || 'ripgrep' -V`)
    expect(nodePin('v26.7.0')).toBe('26.7.0')
    expect(nodePin('')).toBe('26.7.0')
    expect(nodeUpdateAvailable('26.6.0', '26.7.0')).toBe(true)
    expect(nodeUpdateAvailable(undefined, '26.7.0')).toBe(true)
    expect(nodeUpdateAvailable('26.7.0', '26.7.0')).toBe(false)
    expect(nodeUpdateAvailable('26.8.0', '26.7.0')).toBe(false)
    expect(updateCommand({ id: 'typescript', kind: 'npm', spec: 'typescript', bin: 'tsc' })).toEqual(['npm', 'update', '-g', '--prefix', '/home/bros/.local', 'typescript'])
    expect(updateCommand({ id: 'rg', kind: 'cargo', spec: 'ripgrep', bin: 'rg' })).toEqual(['cargo', 'install', '--locked', '--root', '/home/bros/.cargo', 'ripgrep'])
    expect(versionCommand({ id: 'uv', kind: 'uv', spec: 'uv', bin: 'uv' })).toBe(`'uv' --version 2>/dev/null || 'uv' -V`)
    expect(versionCommand({ id: 'ruff', kind: 'uv', spec: 'ruff==0.6.8', bin: 'ruff' })).toBe(`'ruff' --version 2>/dev/null || 'ruff' -V`)
    expect(versionCommand({ id: 'rg', kind: 'cargo', spec: 'ripgrep@14.1.0', bin: 'rg' })).toBe(`'rg' --version 2>/dev/null || 'rg' -V`)
    expect(parseVersionText('uv', 'uv', 'uv 0.13.5 (c4b4d8c4 2026-01-01)')).toBe('0.13.5')
    expect(parseVersionText('uv', 'ruff==0.6.8', 'ruff v0.6.8\n- ruff\n')).toBe('0.6.8')
    expect(parseVersionText('cargo', 'ripgrep@14.1.0', 'ripgrep v14.1.0:\n    rg\n')).toBe('14.1.0')
    expect(parseVersionText('apt', 'jq', '1.7.1-3')).toBe('1.7.1-3')
    const probed = [
      { id: 'jq', kind: 'apt', spec: 'jq' },
      { id: 'cursor', kind: 'deb', spec: 'https://example.com/cursor/latest', bin: 'cursor' },
    ]
    expect(versionShell('true')).toBe([
      'eval "$(devbox global shellenv --init-hook 2>/dev/null)" || true',
      '. "$HOME/.cargo/env" 2>/dev/null || true',
      'true',
    ].join('\n'))
    expect(buildVersionScript(probed).split('\n').filter((line) => line === 'echo')).toHaveLength(2)
    expect(parseVersionScriptOutput('@@jq\n1.8.1-4ubuntu2\n@@cursor\n3.27.6-1792578269\n', probed)).toEqual([
      { id: 'jq', version: '1.8.1-4ubuntu2' },
      { id: 'cursor', version: '3.27.6-1792578269' },
    ])
    expect(parseVersionText('npm', 'typescript', '/usr/local/lib\n└── typescript@5.4.5\n')).toBe('5.4.5')
    expect(packageUpdateAction('run')).toBe('rebuild')
    expect(packageUpdateAction('deb')).toBe('exec')
    expect(packageUpdateAction('npm')).toBe('exec')
  })

  it('chowns a root-owned desktop build dir through docker as root', () => {
    expect(claimDirArgs('/data/build/desktop', 1000, 1000)).toEqual([
      'run', '--rm', '-u', '0', '--entrypoint', 'chown', '-v', '/data/build/desktop:/claim', 'bros:latest', '-R', '1000:1000', '/claim',
    ])
  })

  it('records addon enable in enabled-apps and drops shipped copies', () => {
    const root = mkdtempSync(join(tmpdir(), 'bros-enable-'))
    const keys = ['BROS_DIR', 'BROS_DIR', 'BROS_WORKING_DIR', 'BROS_DATA_DIR', 'BROS_HOST_REPO', 'BROS_DATA_DIR'] as const
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
    for (const key of keys) delete process.env[key]
    process.env.BROS_DIR = root
    const put = (dir: string, body: string) => {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'config.yml'), body)
    }
    try {
      put(join(root, 'lib', 'apps', 'core', 'node'), 'id: node\nname: Node\nkind: nix\nspec: nodejs\nbin: node\n')
      put(join(root, 'lib', 'apps', 'addon', 'demo'), 'id: demo\nname: Demo\nkind: npm\nspec: demo\nbin: demo\n')
      put(join(root, 'lib', 'apps', 'addon', 'opencode'), 'id: opencode\nname: OpenCode\nkind: npm\nspec: "@opencode/cli"\nbin: opencode\nservices:\n  - command: opencode serve\n')
      put(join(root, 'lib', 'apps', 'addon', 'jq'), 'id: jq\nname: jq\nkind: apt\nspec: jq\nbin: jq\n')
      const apps = join(root, 'data', 'config', 'apps')
      put(join(apps, 'opencode'), 'id: opencode\nkind: npm\nspec: "@opencode/cli"\nbin: opencode\nenabled: true\n')
      put(join(apps, 'jq'), 'id: jq\nkind: apt\nspec: jq\nbin: jq\nenabled: false\n')
      put(join(apps, 'node'), 'id: node\nkind: nix\nspec: nodejs\nbin: node\nenabled: true\n')
      put(join(apps, 'herdr'), 'id: herdr\nkind: run\nspec: curl -fsSL https://example.com/install | bash\nbin: herdr\n')
      enableAddonApp('demo')
      const listed = readFileSync(join(root, 'data', 'config', 'enabled-apps'), 'utf8').trim().split('\n')
      expect(listed).toEqual(['demo', 'opencode'])
      expect(existsSync(join(apps, 'demo', 'config.yml'))).toBe(false)
      expect(existsSync(join(apps, 'opencode'))).toBe(false)
      expect(existsSync(join(apps, 'jq'))).toBe(false)
      expect(existsSync(join(apps, 'node'))).toBe(false)
      expect(existsSync(join(apps, 'herdr', 'config.yml'))).toBe(true)
      writeCliPackages(readStoredPackages())
      expect(existsSync(join(apps, 'herdr', 'config.yml'))).toBe(true)
      expect(existsSync(join(apps, 'demo'))).toBe(false)
      expect(existsSync(join(apps, 'opencode'))).toBe(false)
      const rows = readCliPackages()
      expect(rows.find((row) => row.id === 'opencode')).toMatchObject({ enabled: true, services: [{ command: 'opencode serve' }] })
      expect(rows.find((row) => row.id === 'demo')?.enabled).toBe(true)
      expect(rows.find((row) => row.id === 'jq')?.enabled).toBe(false)
      expect(rows.find((row) => row.id === 'node')?.enabled).toBe(true)
      expect(rows.find((row) => row.id === 'herdr')).toMatchObject({ tier: 'custom', enabled: true })
      expect(readFileSync(join(root, 'data', 'config', 'enabled-apps'), 'utf8')).not.toMatch(/^(node|herdr|jq)$/m)
    } finally {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key]
        else process.env[key] = saved[key]
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rebuilds a package change instead of installing into the running container', () => {
    expect(cliApplyAction(false, false)).toBe('start')
    expect(cliApplyAction(false, true)).toBe('start')
    expect(cliApplyAction(true, false)).toBe('skip')
    expect(cliApplyAction(true, true)).toBe('recreate')
    expect(cliApplyAction(true, false, true)).toBe('recreate')
  })
})
