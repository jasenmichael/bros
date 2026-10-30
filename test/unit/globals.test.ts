import { describe, expect, it } from 'vitest'
import { parseCliPackage } from '../../src/server/utils/cli/packages'
import {
  globalAdoptInput,
  globalAdoptRefusal,
  globalPackageName,
  markGlobalNames,
  parseBunPackageJson,
  parseCargoList,
  parseDevboxList,
  parseNpmLs,
  parsePnpmList,
  parseUvTools,
} from '../../src/server/utils/cli/globals'

describe('global packages', () => {
  it('parses top-level names and strips versions', () => {
    expect(parseNpmLs(`{"dependencies":{"cowsay":{"version":"1.5.0"},"@opencode/cli":{"version":"1.0.0"}}}
---npm---
{"dependencies":{"cowsay":{"version":"1.5.0"},"typescript":{"version":"5.0.0"}}}`)).toEqual(['@opencode/cli', 'cowsay', 'typescript'])
    expect(parsePnpmList('[{"dependencies":{"typescript":{"version":"5.4.5"}}}]')).toEqual(['typescript'])
    expect(parseBunPackageJson('{"dependencies":{"elysia":"1.0.0"},"devDependencies":{"bun-types":"1.0.0"}}')).toEqual(['elysia'])
    expect(parseUvTools('ruff v0.6.8\n- ruff\ncowsay v1.0.0\n- cowsay\n')).toEqual(['cowsay', 'ruff'])
    expect(parseCargoList('ripgrep v14.1.0:\n    rg\nfd-find v9.0.0:\n    fd\n')).toEqual(['fd-find', 'ripgrep'])
    expect(parseDevboxList('* nodejs@26.7.0\nripgrep 14.1.0\ngithub:NixOS/nixpkgs#hello\nInfo: nothing\n')).toEqual(['hello', 'nodejs', 'ripgrep'])
    expect(globalPackageName('nix', 'nodejs@26.7.0')).toBe('nodejs')
    expect(globalPackageName('npm', '@opencode/cli@1.0.0')).toBe('@opencode/cli')
    expect(globalPackageName('cargo', 'ripgrep@14.1.0')).toBe('ripgrep')
    expect(globalPackageName('uv', 'ruff==0.6.8')).toBe('ruff')
  })

  it('marks owned specs and refuses a second app', () => {
    const packages = [
      { id: 'paperclip', kind: 'npm', spec: 'paperclipai' },
      { id: 'node', kind: 'nix', spec: 'nodejs' },
      { id: 'cowsay', kind: 'nix', spec: 'cowsay' },
    ]
    expect(markGlobalNames('npm', ['cowsay', 'paperclipai'], packages)).toEqual([
      { name: 'cowsay', owned: false },
      { name: 'paperclipai', owned: true },
    ])
    expect(globalAdoptRefusal('npm', 'paperclipai', packages, [], () => false)).toBe('That package is already an app')
    expect(globalAdoptRefusal('npm', 'cowsay', packages, [], () => false)).toBe('Id "cowsay" is already an app')
    expect(globalAdoptRefusal('npm', 'typescript', packages, [], (id) => id === 'typescript')).toBe('Id "typescript" is reserved')
    expect(globalAdoptRefusal('apt', 'ripgrep', packages, [], () => false)).toBe('kind is invalid')
    expect(globalAdoptRefusal('npm', 'typescript', packages, [], () => false)).toBeNull()
    expect(globalAdoptRefusal('npm', 'npm', [], [], () => false)).toBe('That package is a built-in manager')
    expect(globalAdoptRefusal('nix', 'nodejs', [], [], () => false)).toBe('That package is a built-in manager')
    expect(globalAdoptRefusal('nix', 'deno', [], [], () => false)).toBe('That package is a built-in manager')
    expect(globalAdoptRefusal('uv', 'graphify', [], [], () => false)).toBeNull()
    expect(markGlobalNames('nix', ['nodejs', 'graphify', 'ghostty'], [{ tier: 'core', kind: 'nix', spec: 'nodejs' }, { kind: 'nix', spec: 'ghostty' }])).toEqual([
      { name: 'graphify', owned: false },
      { name: 'ghostty', owned: true },
    ])
    expect(markGlobalNames('npm', ['npm', 'pnpm', 'paperclipai'], [{ kind: 'npm', spec: 'paperclipai' }])).toEqual([
      { name: 'paperclipai', owned: true },
    ])
  })

  it('builds an enabled config and does not install', () => {
    const pkg = parseCliPackage(globalAdoptInput('npm', 'cowsay'), [])
    expect(pkg).toMatchObject({
      id: 'cowsay',
      kind: 'npm',
      spec: 'cowsay',
      bin: 'cowsay',
      interfaces: [{ type: 'cli', command: 'cowsay' }],
    })
    expect(pkg.enabled).toBeUndefined()
    expect(pkg.volumes).toBeUndefined()
    const scoped = parseCliPackage(globalAdoptInput('npm', '@scope/cli@1.2.3'), [])
    expect(scoped).toMatchObject({ id: 'cli', spec: '@scope/cli', bin: 'cli' })
  })
})
