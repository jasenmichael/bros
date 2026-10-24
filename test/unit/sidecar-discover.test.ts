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
    writePackage(join(shipped, 'addon'), 'routeslug', 'slug: taken-slug')
    writePackage(custom, 'opencode')
    writePackage(custom, 'mine')
    writePackage(custom, 'alias', 'slug: taken-slug')
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
    expect(byId.routeslug.kind).toBe('addon')
    expect(byId.alias).toBeUndefined()
    expect(errors.some((e) => e.includes('opencode') && e.includes('id'))).toBe(true)
    expect(errors.some((e) => e.includes('alias') && e.includes('slug'))).toBe(true)

    const disabled = discoverSidecars({
      shippedRoot: shipped,
      customRoot: custom,
      dataDir,
      env: { BROS_SIDECAR_OPENCODE: '0', BROS_SIDECARS_DISABLE: 'routeslug' },
    })
    const off = Object.fromEntries(disabled.sidecars.map((s) => [s.id, s]))
    expect(off.opencode.source).toBe('shipped')
    expect(off.opencode.disabled).toBe(true)
    expect(off.opencode.dir).toBe(join(shipped, 'addon', 'opencode'))
    expect(off.routeslug.source).toBe('shipped')
    expect(off.routeslug.disabled).toBe(true)
    expect(off.alias).toBeUndefined()
    expect(off.openwebui.source).toBe('shipped')
    expect(off.openwebui.disabled).toBe(false)
    expect(disabled.errors.some((e) => e.includes('opencode') && e.includes('id'))).toBe(true)
    expect(disabled.errors.some((e) => e.includes('alias') && e.includes('slug'))).toBe(true)
    expect(shouldAutostartSidecar(off.opencode, { autostart: true })).toBe(false)
    expect(isReservedSidecarId('opencode', { shippedRoot: shipped, env: { BROS_SIDECAR_OPENCODE: '0' } })).toBe(true)
    expect(isReservedSidecarId('routeslug', { shippedRoot: shipped, env: { BROS_SIDECARS_DISABLE: 'routeslug' } })).toBe(true)
    expect(isReservedSidecarId('opencode', { shippedRoot: shipped, env: {} })).toBe(true)
    expect(isReservedSidecarId('ollama', { shippedRoot: shipped, env: { BROS_SIDECAR_OLLAMA: '0' } })).toBe(true)
  })

  it('lists env-disabled addons and skips autostart', () => {
    expect(disabledAddonIds({ BROS_SIDECARS_DISABLE: 'opencode,openwebui' })).toEqual(new Set(['opencode', 'openwebui']))
    expect(disabledAddonIds({ BROS_SIDECAR_OPENCODE: '0' })).toEqual(new Set(['opencode']))
    expect(readFileSync(join(import.meta.dirname, '../../docker-compose.yml'), 'utf8')).toContain('BROS_SIDECAR_OPENCODE: ${BROS_SIDECAR_OPENCODE:-0}')
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
    expect(opencode?.source).toBe('shipped')
    expect(opencode?.disabled).toBe(true)
    expect(shouldAutostartSidecar(opencode!, { autostart: true })).toBe(false)
    expect(shouldAutostartSidecar({ id: CORE_SIDECAR_ID }, { autostart: false })).toBe(true)
    expect(shouldAutostartSidecar({ id: 'mine', disabled: false }, { autostart: true })).toBe(true)
    expect(shouldAutostartSidecar({ id: 'whisper', disabled: false }, { autostart: true })).toBe(false)
  })

  it('writes custom sidecars under lib/sidecars/custom and rejects reserved ids', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-custom-'))
    const shipped = join(root, 'lib', 'sidecars')
    const custom = join(shipped, 'custom')
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

  it('keeps a disabled addon listed and rejects a custom pack with that id', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-disabled-addon-'))
    const shipped = join(root, 'lib', 'sidecars')
    const custom = join(root, 'sidecars')
    const dataDir = join(root, 'data')
    const id = 'fakedis'
    writePackage(join(shipped, 'addon'), id, 'slug: fakedis-slug')
    writePackage(custom, id)
    writePackage(custom, 'fakealias', 'slug: fakedis-slug')

    const { sidecars, errors } = discoverSidecars({
      shippedRoot: shipped,
      customRoot: custom,
      dataDir,
      env: { BROS_SIDECARS_DISABLE: id },
    })
    const byId = Object.fromEntries(sidecars.map((s) => [s.id, s]))

    expect(byId[id].source).toBe('shipped')
    expect(byId[id].disabled).toBe(true)
    expect(byId[id].dir).toBe(join(shipped, 'addon', id))
    expect(byId.fakealias).toBeUndefined()
    expect(errors).toContain(`Custom sidecar "${id}" conflicts with a shipped or reserved id — rejected`)
    expect(errors).toContain('Custom sidecar "fakealias" conflicts with a shipped or reserved slug — rejected')
    expect(isReservedSidecarId(id, { shippedRoot: shipped, env: { BROS_SIDECARS_DISABLE: id } })).toBe(true)
    expect(shouldAutostartSidecar(byId[id], { autostart: true })).toBe(false)
  })

  it('rejects a custom pack that duplicates an enabled addon', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-enabled-addon-'))
    const shipped = join(root, 'lib', 'sidecars')
    const custom = join(root, 'sidecars')
    const dataDir = join(root, 'data')
    const id = 'fakeon'
    writePackage(join(shipped, 'addon'), id)
    writePackage(custom, id)

    const { sidecars, errors } = discoverSidecars({
      shippedRoot: shipped,
      customRoot: custom,
      dataDir,
      env: {},
    })
    const row = sidecars.find((s) => s.id === id)

    expect(row?.source).toBe('shipped')
    expect(row?.kind).toBe('addon')
    expect(row?.dir).toBe(join(shipped, 'addon', id))
    expect(sidecars.some((s) => s.source === 'custom' && s.id === id)).toBe(false)
    expect(errors).toContain(`Custom sidecar "${id}" conflicts with a shipped or reserved id — rejected`)
    expect(isReservedSidecarId(id, { shippedRoot: shipped, env: {} })).toBe(true)
  })

  it('derives a repo folder name from a git URL', () => {
    expect(sidecarRepoNameFromUrl('https://github.com/org/my-sidecars.git')).toBe('my-sidecars')
    expect(sidecarRepoNameFromUrl('git@github.com:org/Pack.git')).toBe('pack')
  })

  it('finds custom packs under lib/sidecars/custom', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-shadow-'))
    const libCore = join(root, 'lib', 'sidecars', 'core')
    const custom = join(root, 'lib', 'sidecars', 'custom')
    writePackage(libCore, 'ollama')
    writePackage(custom, 'mine')

    const prevDir = process.env.BROS_DIR
    try {
      process.env.BROS_DIR = root
      expect(shippedSidecarsRoot()).toBe(join(root, 'lib', 'sidecars'))
      expect(customSidecarsRoot()).toBe(custom)
      const { sidecars } = discoverSidecars()
      expect(sidecars.map((s) => s.id).sort()).toEqual(['mine', 'ollama'])
    } finally {
      if (prevDir === undefined) delete process.env.BROS_DIR
      else process.env.BROS_DIR = prevDir
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
