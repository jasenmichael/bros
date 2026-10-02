import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CORE_SIDECAR_ID,
  customSidecarsRoot,
  disabledAddonIds,
  discoverSidecars,
  isReservedSidecarId,
  shippedSidecarsRoot,
  shouldAutostartSidecar,
  sidecarRepoNameFromUrl,
  writeCustomSidecar,
} from '../../src/server/utils/sidecars/sidecars'

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
    const shipped = join(root, 'lib', 'sidecars')
    const custom = join(root, 'sidecars')
    const dataDir = join(root, 'data')
    writePackage(join(shipped, 'core'), 'ollama')
    writePackage(join(shipped, 'addon'), 'opencode')
    writePackage(join(shipped, 'addon'), 'openwebui')
    writePackage(custom, 'opencode')
    writePackage(custom, 'mine')
    const repoSidecars = join(custom, 'extra', 'sidecars')
    writePackage(repoSidecars, 'fromgit')
    mkdirSync(join(custom, 'extra', '.git'), { recursive: true })
    writeFileSync(join(custom, 'extra', '.git', 'config'), [
      '[remote "origin"]',
      '  url = https://github.com/example/extra.git',
      '',
    ].join('\n'))

    const { sidecars, errors } = discoverSidecars({ shippedRoot: shipped, customRoot: custom, dataDir })
    const byId = Object.fromEntries(sidecars.map((s) => [s.id, s]))

    expect(byId.ollama.kind).toBe('core')
    expect(byId.ollama.source).toBe('shipped')
    expect(byId.ollama.disabled).toBe(false)
    expect(byId.opencode.kind).toBe('addon')
    expect(byId.opencode.source).toBe('shipped')
    expect(byId.opencode.dir).toBe(join(shipped, 'addon', 'opencode'))
    expect(byId.mine.kind).toBe('additional')
    expect(byId.mine.source).toBe('custom')
    expect(byId.mine.dir).toBe(join(custom, 'mine'))
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
    expect(disabledAddonIds({ BROS_SIDECAR_OPENJEV: '0' })).toEqual(new Set(['openjev']))
    expect(disabledAddonIds({ BROS_SIDECAR_OLLAMA: '0', BROS_SIDECARS_DISABLE: 'ollama,opencode' })).toEqual(new Set(['opencode']))
    expect(disabledAddonIds({ BROS_SIDECAR_WHISPER: '0', BROS_SIDECARS_DISABLE: 'whisper,opencode' })).toEqual(new Set(['opencode']))

    root = mkdtempSync(join(tmpdir(), 'bros-disable-'))
    const shipped = join(root, 'lib', 'sidecars')
    writePackage(join(shipped, 'core'), 'ollama')
    writePackage(join(shipped, 'addon'), 'opencode')
    const { sidecars } = discoverSidecars({
      shippedRoot: shipped,
      customRoot: join(root, 'sidecars'),
      dataDir: join(root, 'data'),
      env: { BROS_SIDECAR_OPENCODE: '0' },
    })
    const opencode = sidecars.find((s) => s.id === 'opencode')
    expect(opencode?.disabled).toBe(true)
    expect(shouldAutostartSidecar(opencode!, { autostart: true })).toBe(false)
    expect(shouldAutostartSidecar({ id: CORE_SIDECAR_ID }, { autostart: false })).toBe(true)
    expect(shouldAutostartSidecar({ id: 'mine', disabled: false }, { autostart: true })).toBe(true)
    expect(shouldAutostartSidecar({ id: 'whisper', disabled: false }, { autostart: true })).toBe(false)
  })

  it('writes custom sidecars under BROS_SIDECARS_DIR and rejects reserved ids', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-custom-'))
    const shipped = join(root, 'lib', 'sidecars')
    const custom = join(root, 'sidecars')
    const dataDir = join(root, 'data')
    writePackage(join(shipped, 'core'), 'ollama')
    writePackage(join(shipped, 'addon'), 'opencode')

    const opts = { shippedRoot: shipped, customRoot: custom, dataDir }
    expect(isReservedSidecarId('ollama', opts)).toBe(true)
    expect(isReservedSidecarId('whisper', opts)).toBe(true)
    expect(isReservedSidecarId('opencode', opts)).toBe(true)
    expect(isReservedSidecarId('chat', opts)).toBe(true)

    try {
      writeCustomSidecar({
        id: 'ollama',
        sidecarYml: 'id: ollama\nname: Nope\ninterfaces: []\n',
        composeYml: 'services: {}\n',
      }, opts)
      expect.unreachable()
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 400, statusMessage: 'Id "ollama" is reserved' })
    }

    const created = writeCustomSidecar({
      id: 'mine',
      sidecarYml: 'id: mine\nname: Mine\ninterfaces: []\n',
      composeYml: 'services:\n  mine:\n    image: nginx:alpine\n',
    }, opts)
    expect(created.source).toBe('custom')
    expect(created.kind).toBe('additional')
    expect(readFileSync(join(custom, 'mine', 'sidecar.yml'), 'utf8')).toContain('id: mine')
    expect(readFileSync(join(custom, 'mine', 'docker-compose.yml'), 'utf8')).toContain('nginx:alpine')
  })

  it('derives a repo folder name from a git URL', () => {
    expect(sidecarRepoNameFromUrl('https://github.com/org/my-sidecars.git')).toBe('my-sidecars')
    expect(sidecarRepoNameFromUrl('git@github.com:org/Pack.git')).toBe('pack')
  })

  it('falls back to lib/sidecars and checkout sidecars when production mounts are absent', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-shadow-'))
    const libCore = join(root, 'lib', 'sidecars', 'core')
    const custom = join(root, 'sidecars')
    writePackage(libCore, 'ollama')
    writePackage(custom, 'mine')
    const missingCustomMount = join(root, 'sidecars', 'custom')

    const prevDir = process.env.BROS_DIR
    const prevSidecars = process.env.BROS_SIDECARS_DIR
    try {
      process.env.BROS_DIR = root
      process.env.BROS_SIDECARS_DIR = missingCustomMount
      expect(shippedSidecarsRoot()).toBe(join(root, 'lib', 'sidecars'))
      expect(customSidecarsRoot()).toBe(custom)
      const { sidecars } = discoverSidecars()
      expect(sidecars.map((s) => s.id).sort()).toEqual(['mine', 'ollama'])
    } finally {
      if (prevDir === undefined) delete process.env.BROS_DIR
      else process.env.BROS_DIR = prevDir
      if (prevSidecars === undefined) delete process.env.BROS_SIDECARS_DIR
      else process.env.BROS_SIDECARS_DIR = prevSidecars
    }
  })

  it('prefers /app/sidecars when the production core mount exists', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-prod-layout-'))
    writePackage(join(root, 'sidecars', 'core'), 'ollama')
    mkdirSync(join(root, 'lib', 'sidecars'), { recursive: true })
    const prevDir = process.env.BROS_DIR
    try {
      process.env.BROS_DIR = root
      expect(shippedSidecarsRoot()).toBe(join(root, 'sidecars'))
    } finally {
      if (prevDir === undefined) delete process.env.BROS_DIR
      else process.env.BROS_DIR = prevDir
    }
  })
})
