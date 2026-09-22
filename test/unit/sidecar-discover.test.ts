import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CORE_SIDECAR_ID,
  disabledAddonIds,
  discoverSidecars,
  isReservedSidecarId,
  shouldAutostartSidecar,
  sidecarRepoNameFromUrl,
  writeCustomSidecar,
} from '../../src/server/utils/sidecars'

function writePackage(root: string, id: string, extra = '') {
  mkdirSync(join(root, id), { recursive: true })
  writeFileSync(join(root, id, 'sidecar.yml'), [
    `id: ${id}`,
    `name: ${id}`,
    'interfaces: []',
    extra,
    '',
  ].join('\n'))
  writeFileSync(join(root, id, 'docker-compose.yml'), 'services: {}\n')
}

describe('sidecar discover merge', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('merges core, addon, data-dir, and git sources; shipped wins', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-discover-'))
    const shipped = join(root, 'sidecars')
    const dataDir = join(root, 'data')
    writePackage(shipped, 'ollama')
    writePackage(shipped, 'opencode')
    writePackage(shipped, 'openwebui')
    writePackage(join(dataDir, 'sidecars'), 'opencode')
    writePackage(join(dataDir, 'sidecars'), 'mine')
    const repoSidecars = join(dataDir, 'sidecar-repos', 'extra', 'sidecars')
    writePackage(repoSidecars, 'fromgit')
    mkdirSync(join(dataDir, 'sidecar-repos', 'extra', '.git'), { recursive: true })
    writeFileSync(join(dataDir, 'sidecar-repos', 'extra', '.git', 'config'), [
      '[remote "origin"]',
      '  url = https://github.com/example/extra.git',
      '',
    ].join('\n'))

    const { sidecars, errors } = discoverSidecars({ shippedRoot: shipped, dataDir })
    const byId = Object.fromEntries(sidecars.map((s) => [s.id, s]))

    expect(byId.ollama.kind).toBe('core')
    expect(byId.ollama.source).toBe('shipped')
    expect(byId.ollama.disabled).toBe(false)
    expect(byId.opencode.kind).toBe('addon')
    expect(byId.opencode.source).toBe('shipped')
    expect(byId.opencode.dir).toBe(join(shipped, 'opencode'))
    expect(byId.mine.kind).toBe('additional')
    expect(byId.mine.source).toBe('data dir')
    expect(byId.mine.editable).toBe(true)
    expect(byId.fromgit.kind).toBe('additional')
    expect(byId.fromgit.source).toBe('https://github.com/example/extra.git')
    expect(byId.fromgit.editable).toBe(false)
    expect(errors.some((e) => e.includes('opencode'))).toBe(true)
  })

  it('marks env-disabled addons and skips them from autostart', () => {
    expect(disabledAddonIds({ BROS_SIDECARS_DISABLE: 'opencode,openwebui' })).toEqual(new Set(['opencode', 'openwebui']))
    expect(disabledAddonIds({ BROS_SIDECAR_OPENCODE: '0' })).toEqual(new Set(['opencode']))
    expect(disabledAddonIds({ BROS_SIDECAR_FIRECRAWL_UI: '0' })).toEqual(new Set(['firecrawl_ui', 'firecrawl-ui']))
    expect(disabledAddonIds({ BROS_SIDECAR_OLLAMA: '0', BROS_SIDECARS_DISABLE: 'ollama,opencode' })).toEqual(new Set(['opencode']))

    root = mkdtempSync(join(tmpdir(), 'bros-disable-'))
    const shipped = join(root, 'sidecars')
    writePackage(shipped, 'ollama')
    writePackage(shipped, 'opencode')
    const { sidecars } = discoverSidecars({
      shippedRoot: shipped,
      dataDir: join(root, 'data'),
      env: { BROS_SIDECAR_OPENCODE: '0' },
    })
    const opencode = sidecars.find((s) => s.id === 'opencode')
    expect(opencode?.disabled).toBe(true)
    expect(shouldAutostartSidecar(opencode!, { autostart: true })).toBe(false)
    expect(shouldAutostartSidecar({ id: CORE_SIDECAR_ID }, { autostart: false })).toBe(true)
    expect(shouldAutostartSidecar({ id: 'mine', disabled: false }, { autostart: true })).toBe(true)
  })

  it('writes custom sidecars under the data dir and rejects reserved ids', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-custom-'))
    const shipped = join(root, 'sidecars')
    const dataDir = join(root, 'data')
    writePackage(shipped, 'ollama')
    writePackage(shipped, 'opencode')

    expect(isReservedSidecarId('ollama', { shippedRoot: shipped, dataDir })).toBe(true)
    expect(isReservedSidecarId('opencode', { shippedRoot: shipped, dataDir })).toBe(true)
    expect(isReservedSidecarId('chat', { shippedRoot: shipped, dataDir })).toBe(true)

    try {
      writeCustomSidecar({
        id: 'ollama',
        sidecarYml: 'id: ollama\nname: Nope\ninterfaces: []\n',
        composeYml: 'services: {}\n',
      }, { shippedRoot: shipped, dataDir })
      expect.unreachable()
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 400, statusMessage: 'Id "ollama" is reserved' })
    }

    const created = writeCustomSidecar({
      id: 'mine',
      sidecarYml: 'id: mine\nname: Mine\ninterfaces: []\n',
      composeYml: 'services:\n  mine:\n    image: nginx:alpine\n',
    }, { shippedRoot: shipped, dataDir })
    expect(created.source).toBe('data dir')
    expect(created.kind).toBe('additional')
    expect(readFileSync(join(dataDir, 'sidecars', 'mine', 'sidecar.yml'), 'utf8')).toContain('id: mine')
    expect(readFileSync(join(dataDir, 'sidecars', 'mine', 'docker-compose.yml'), 'utf8')).toContain('nginx:alpine')
  })

  it('derives a repo folder name from a git URL', () => {
    expect(sidecarRepoNameFromUrl('https://github.com/org/my-sidecars.git')).toBe('my-sidecars')
    expect(sidecarRepoNameFromUrl('git@github.com:org/Pack.git')).toBe('pack')
  })
})
