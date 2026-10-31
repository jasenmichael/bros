import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CORE_DOCKER_APP_ID,
  customDockerAppsRoot,
  enabledAddonIds,
  discoverDockerApps,
  isReservedDockerAppId,
  shippedDockerAppsRoot,
  shouldAutostartDockerApp,
  dockerAppRepoNameFromUrl,
  writeCustomDockerApp,
} from '../../app/server/utils/docker-app/dockerApps'

function writeDockerApp(root: string, id: string, extra = '') {
  mkdirSync(join(root, id), { recursive: true })
  writeFileSync(join(root, id, 'config.yml'), [
    'kind: docker',
    `id: ${id}`,
    `name: ${id}`,
    'interfaces: []',
    extra,
    '',
  ].join('\n'))
  writeFileSync(join(root, id, 'docker-compose.yml'), 'services: {}\n')
}

function addonDir(root: string) {
  return join(root, 'lib', 'apps', 'addon')
}

describe('dockerApp discover merge', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('merges dockerApps, addon docker apps, and custom apps; shipped wins', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-discover-'))
    const shipped = join(root, 'lib', 'apps', 'core')
    const addon = addonDir(root)
    const custom = join(root, 'dockerApps')
    const dataDir = join(root, 'data')
    writeDockerApp(shipped, 'ollama')
    writeDockerApp(addon, 'opencode')
    writeDockerApp(addon, 'openwebui')
    writeDockerApp(addon, 'routeslug', 'slug: taken-slug')
    writeDockerApp(custom, 'opencode')
    writeDockerApp(custom, 'mine')
    writeDockerApp(custom, 'alias', 'slug: taken-slug')
    const repoDockerApps = join(custom, 'extra', 'apps')
    writeDockerApp(repoDockerApps, 'fromgit')
    mkdirSync(join(custom, 'extra', '.git'), { recursive: true })
    writeFileSync(join(custom, 'extra', '.git', 'config'), [
      '[remote "origin"]',
      '  url = https://github.com/example/extra.git',
      '',
    ].join('\n'))

    const { dockerApps, errors } = discoverDockerApps({ shippedRoot: shipped, customRoot: custom, dataDir })
    const byId = Object.fromEntries(dockerApps.map((s) => [s.id, s]))

    expect(byId.ollama.kind).toBe('core')
    expect(byId.ollama.source).toBe('shipped')
    expect(byId.ollama.disabled).toBe(false)
    expect(byId.opencode.kind).toBe('addon')
    expect(byId.opencode.source).toBe('shipped')
    expect(byId.opencode.dir).toBe(join(addon, 'opencode'))
    expect(byId.mine.kind).toBe('custom')
    expect(byId.mine.source).toBe('custom')
    expect(byId.mine.dir).toBe(join(custom, 'mine'))
    expect(byId.mine.editable).toBe(true)
    expect(byId.fromgit.kind).toBe('custom')
    expect(byId.fromgit.source).toBe('https://github.com/example/extra.git')
    expect(byId.fromgit.editable).toBe(false)
    expect(byId.routeslug.kind).toBe('addon')
    expect(byId.alias).toBeUndefined()
    expect(errors.some((e) => e.includes('opencode') && e.includes('id'))).toBe(true)
    expect(errors.some((e) => e.includes('alias') && e.includes('slug'))).toBe(true)

    expect(isReservedDockerAppId('opencode', { shippedRoot: shipped, env: {} })).toBe(true)
    expect(isReservedDockerAppId('ollama', { shippedRoot: shipped, env: {} })).toBe(true)
  })

  it('BROS_APPS_ENABLED boots listed addons; SQLite Autostart still works', () => {
    expect(enabledAddonIds({ BROS_APPS_ENABLED: 'opencode,openwebui' })).toEqual(new Set(['opencode', 'openwebui']))
    expect(enabledAddonIds({ BROS_APPS_ENABLED: 'ollama,opencode' })).toEqual(new Set(['opencode']))
    expect(enabledAddonIds({ BROS_APPS_ENABLED: 'whisper,firecrawl' })).toEqual(new Set(['firecrawl']))
    expect(readFileSync(join(import.meta.dirname, '../../lib/desktop/docker-compose.yml'), 'utf8')).toContain('BROS_APPS_ENABLED')

    root = mkdtempSync(join(tmpdir(), 'bros-enabled-'))
    const shipped = join(root, 'lib', 'apps', 'core')
    writeDockerApp(shipped, 'ollama')
    writeDockerApp(addonDir(root), 'opencode')
    const { dockerApps } = discoverDockerApps({
      shippedRoot: shipped,
      customRoot: join(root, 'dockerApps'),
      dataDir: join(root, 'data'),
      env: { BROS_APPS_ENABLED: 'opencode' },
    })
    const opencode = dockerApps.find((s) => s.id === 'opencode')
    expect(opencode?.source).toBe('shipped')
    expect(opencode?.disabled).toBe(false)
    expect(shouldAutostartDockerApp(opencode!, { autostart: false }, { BROS_APPS_ENABLED: 'opencode' })).toBe(true)
    expect(shouldAutostartDockerApp(opencode!, { autostart: false }, {})).toBe(false)
    expect(shouldAutostartDockerApp(opencode!, { autostart: true }, {})).toBe(true)
    expect(shouldAutostartDockerApp({ id: CORE_DOCKER_APP_ID }, { autostart: false })).toBe(true)
    expect(shouldAutostartDockerApp({ id: 'mine', disabled: false }, { autostart: true })).toBe(true)
    expect(shouldAutostartDockerApp({ id: 'whisper', disabled: false }, { autostart: true })).toBe(false)
  })

  it('writes custom docker apps under data/config/apps and rejects reserved ids', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-custom-'))
    const shipped = join(root, 'lib', 'apps', 'core')
    const custom = join(root, 'data', 'config', 'apps')
    const dataDir = join(root, 'data')
    writeDockerApp(shipped, 'ollama')
    writeDockerApp(addonDir(root), 'opencode')

    const opts = { shippedRoot: shipped, customRoot: custom, dataDir }
    expect(isReservedDockerAppId('ollama', opts)).toBe(true)
    expect(isReservedDockerAppId('whisper', opts)).toBe(true)
    expect(isReservedDockerAppId('opencode', opts)).toBe(true)
    expect(isReservedDockerAppId('chat', opts)).toBe(true)

    try {
      writeCustomDockerApp({
        id: 'ollama',
        configYml: 'id: ollama\nname: Nope\ninterfaces: []\n',
        composeYml: 'services: {}\n',
      }, opts)
      expect.unreachable()
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 400, statusMessage: 'Id "ollama" is reserved' })
    }

    const created = writeCustomDockerApp({
      id: 'mine',
      configYml: 'id: mine\nname: Mine\ninterfaces: []\n',
      composeYml: 'services:\n  mine:\n    image: nginx:alpine\n',
    }, opts)
    expect(created.source).toBe('custom')
    expect(created.kind).toBe('custom')
    expect(readFileSync(join(custom, 'mine', 'config.yml'), 'utf8')).toContain('kind: docker')
    expect(readFileSync(join(custom, 'mine', 'config.yml'), 'utf8')).toContain('id: mine')
    expect(readFileSync(join(custom, 'mine', 'docker-compose.yml'), 'utf8')).toContain('nginx:alpine')
  })

  it('keeps a shipped addon listed and rejects a custom app with that id', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-shipped-addon-'))
    const shipped = join(root, 'lib', 'apps', 'core')
    const custom = join(root, 'dockerApps')
    const dataDir = join(root, 'data')
    const id = 'fakedis'
    writeDockerApp(addonDir(root), id, 'slug: fakedis-slug')
    writeDockerApp(custom, id)
    writeDockerApp(custom, 'fakealias', 'slug: fakedis-slug')

    const { dockerApps, errors } = discoverDockerApps({
      shippedRoot: shipped,
      customRoot: custom,
      dataDir,
    })
    const byId = Object.fromEntries(dockerApps.map((s) => [s.id, s]))

    expect(byId[id].source).toBe('shipped')
    expect(byId[id].disabled).toBe(false)
    expect(byId[id].dir).toBe(join(addonDir(root), id))
    expect(byId.fakealias).toBeUndefined()
    expect(errors).toContain(`Custom docker app "${id}" conflicts with a shipped or reserved id — rejected`)
    expect(errors).toContain('Custom docker app "fakealias" conflicts with a shipped or reserved slug — rejected')
    expect(isReservedDockerAppId(id, { shippedRoot: shipped })).toBe(true)
    expect(shouldAutostartDockerApp(byId[id], { autostart: false })).toBe(false)
  })

  it('rejects a custom pack that duplicates an enabled addon', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-enabled-addon-'))
    const shipped = join(root, 'lib', 'apps', 'core')
    const custom = join(root, 'dockerApps')
    const dataDir = join(root, 'data')
    const id = 'fakeon'
    writeDockerApp(addonDir(root), id)
    writeDockerApp(custom, id)

    const { dockerApps, errors } = discoverDockerApps({
      shippedRoot: shipped,
      customRoot: custom,
      dataDir,
      env: {},
    })
    const row = dockerApps.find((s) => s.id === id)

    expect(row?.source).toBe('shipped')
    expect(row?.kind).toBe('addon')
    expect(row?.dir).toBe(join(addonDir(root), id))
    expect(dockerApps.some((s) => s.source === 'custom' && s.id === id)).toBe(false)
    expect(errors).toContain(`Custom docker app "${id}" conflicts with a shipped or reserved id — rejected`)
    expect(isReservedDockerAppId(id, { shippedRoot: shipped, env: {} })).toBe(true)
  })

  it('derives a repo folder name from a git URL', () => {
    expect(dockerAppRepoNameFromUrl('https://github.com/org/my-pack.git')).toBe('my-pack')
    expect(dockerAppRepoNameFromUrl('git@github.com:org/Pack.git')).toBe('pack')
  })

  it('finds custom apps under data/config/apps', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-shadow-'))
    writeDockerApp(join(root, 'lib', 'apps', 'core'), 'ollama')
    const custom = join(root, 'data', 'config', 'apps')
    writeDockerApp(custom, 'mine')

    const prevDir = process.env.BROS_DIR
    const prevData = process.env.BROS_DATA_DIR
    try {
      process.env.BROS_DIR = root
      delete process.env.BROS_DATA_DIR
      expect(shippedDockerAppsRoot()).toBe(join(root, 'lib', 'apps', 'core'))
      expect(customDockerAppsRoot()).toBe(custom)
      const { dockerApps } = discoverDockerApps()
      expect(dockerApps.map((s) => s.id).sort()).toEqual(['mine', 'ollama'])
    } finally {
      if (prevDir === undefined) delete process.env.BROS_DIR
      else process.env.BROS_DIR = prevDir
      if (prevData === undefined) delete process.env.BROS_DATA_DIR
      else process.env.BROS_DATA_DIR = prevData
    }
  })

  it('ships core docker apps from lib/apps/core', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-prod-layout-'))
    const core = join(root, 'lib', 'apps', 'core')
    writeDockerApp(core, 'ollama')
    writeDockerApp(core, 'whisper')
    writeDockerApp(addonDir(root), 'openwebui')
    const prevDir = process.env.BROS_DIR
    try {
      process.env.BROS_DIR = root
      expect(shippedDockerAppsRoot()).toBe(core)
      const { dockerApps } = discoverDockerApps()
      const byId = Object.fromEntries(dockerApps.map((s) => [s.id, s]))
      expect(byId.ollama.kind).toBe('core')
      expect(byId.ollama.dir).toBe(join(core, 'ollama'))
      expect(byId.whisper.kind).toBe('core')
      expect(byId.whisper.dir).toBe(join(core, 'whisper'))
      expect(byId.openwebui.kind).toBe('addon')
      expect(shouldAutostartDockerApp(byId.openwebui, { autostart: true })).toBe(true)
      expect(shouldAutostartDockerApp(byId.openwebui, { autostart: false })).toBe(false)
    } finally {
      if (prevDir === undefined) delete process.env.BROS_DIR
      else process.env.BROS_DIR = prevDir
    }
  })
})
