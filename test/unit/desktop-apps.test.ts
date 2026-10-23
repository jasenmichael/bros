import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appsComposeBody, catalogRoot, desktopAppsDockerfile, parseCliPackage, parseServices, readCatalog } from '../../src/server/utils/cli/packages'
import { commandsForRunning, runningIds, servicesFromYaml } from '../../lib/sidecars/core/desktop/app-services/supervise.mjs'
import { listedPackageApp, listedSidecarApp } from '../../src/ui/utils/gui'

const root = join(import.meta.dirname, '../..')

const paperclip = 'id: paperclip\nenabled: true\nservices:\n  - script: serve.sh\n'
const jq = 'id: jq\nkind: apt\n'

describe('desktop package apps', () => {
  it('leaves paperclip disabled and publishes 3100 only when enabled', () => {
    const catalog = readCatalog()
    const paperclip = catalog.find((pkg) => pkg.id === 'paperclip')
    expect(paperclip?.tier).toBe('addon')
    expect(paperclip?.enabled).toBe(false)
    expect(paperclip?.services?.[0]?.script).toBe('serve.sh')
    expect(readFileSync(join(root, 'lib/apps/addon/paperclip/serve.sh'), 'utf8')).toContain('onboard --yes --bind lan')
    expect(appsComposeBody(catalog)).not.toContain('3100')
    const enabled = catalog.map((pkg) => pkg.id === 'paperclip' ? { ...pkg, enabled: true } : pkg)
    expect(appsComposeBody(enabled)).toContain('3100:3100')
  })

  it('does not install packages from the desktop init script', () => {
    const init = readFileSync(join(root, 'lib/sidecars/core/desktop/root/custom-cont-init.d/bros-live'), 'utf8')
    const dockerfile = readFileSync(join(root, 'lib/sidecars/core/desktop/Dockerfile'), 'utf8')
    expect(init).toContain('install.mjs --kind nix')
    expect(init).not.toContain('BROS_IMAGE_INSTALL')
    expect(dockerfile).toContain('node:26.7.0-bookworm-slim')
    expect(dockerfile).not.toContain('BROS_IMAGE_INSTALL=1')
    expect(dockerfile).not.toContain('paperclip.sh')
    const layers = desktopAppsDockerfile(dockerfile, [
      { id: 'cursor', tier: 'addon' },
      { id: 'npm', tier: 'core' },
      { id: 'agent', tier: 'addon' },
      { id: 'pnpm', tier: 'core' },
      { id: 'ripgrep', tier: 'custom', kind: 'nix' },
    ])
    expect([...layers.matchAll(/--only (\S+)/g)].map((match) => match[1])).toEqual(['npm', 'pnpm', 'agent', 'cursor'])
    expect(layers).not.toContain('ripgrep')
    expect(layers).toContain('id=bros-pkg')
    expect(readFileSync(join(root, 'lib/sidecars/core/desktop/docker-compose.yml'), 'utf8')).toContain('core/desktop/enabled-apps/Dockerfile')
  })

  it('reads shipped apps from config.yml', () => {
    const ids = readCatalog().map((pkg) => pkg.id).sort()
    expect(ids).toEqual(['agent', 'bun', 'cursor', 'jq', 'npm', 'opencode', 'paperclip', 'pnpm', 'uv'])
    expect(readCatalog().find((pkg) => pkg.id === 'npm')?.bin).toBe('npm')
  })

  it('reads addon apps from BROS_HOST_REPO when the app dir has no catalog', () => {
    const prevRepo = process.env.BROS_HOST_REPO
    const prevDir = process.env.BROS_DIR
    process.env.BROS_HOST_REPO = root
    process.env.BROS_DIR = mkdtempSync(join(tmpdir(), 'bros-apps-'))
    try {
      expect(catalogRoot()).toBe(join(root, 'lib', 'apps'))
      expect(readCatalog().find((pkg) => pkg.id === 'cursor')?.tier).toBe('addon')
    } finally {
      if (prevRepo == null) delete process.env.BROS_HOST_REPO
      else process.env.BROS_HOST_REPO = prevRepo
      if (prevDir == null) delete process.env.BROS_DIR
      else process.env.BROS_DIR = prevDir
    }
  })

  it('reads a services command or script from app yaml', () => {
    expect(servicesFromYaml('services:\n  - paperclipai run\n')).toEqual([{ command: 'paperclipai run' }])
    expect(servicesFromYaml('services:\n  - script: serve.sh\n')).toEqual([{ command: 'serve.sh', script: 'serve.sh' }])
    expect(parseServices([{ script: 'serve.sh' }])).toEqual([{ command: 'serve.sh', script: 'serve.sh' }])
    expect(parseCliPackage({ kind: 'run', spec: 'curl -fsSL https://example.com/install | sh', uninstall: 'uninstall.sh' }).uninstall).toBe('uninstall.sh')
  })

  it('keeps a disabled sidecar and a disabled package off Desktop and Terminal', () => {
    expect(listedSidecarApp({ disabled: true })).toBe(false)
    expect(listedSidecarApp({ disabled: false })).toBe(true)
    expect(listedPackageApp({ enabled: false })).toBe(false)
    expect(listedPackageApp({ enabled: true })).toBe(true)
    expect(readFileSync(join(root, 'lib/sidecars/core/desktop/install.mjs'), 'utf8')).not.toContain("['npm', 'pnpm', 'bun']")
  })

  it('launches a services command only when its id is in the running set', () => {
    const files = [{ text: paperclip }, { text: jq }]
    expect(runningIds('{"ids":["paperclip"]}')).toEqual(['paperclip'])
    expect(runningIds('')).toEqual([])
    expect(commandsForRunning(files, ['paperclip'])).toEqual([{ id: 'paperclip', command: './serve.sh' }])
    expect(commandsForRunning([{ text: 'id: demo\nservices:\n  - script: serve.sh\n', dir: '/opt/bros/enabled-apps/demo' }], ['demo'])).toEqual([{ id: 'demo', command: './serve.sh', cwd: '/opt/bros/enabled-apps/demo' }])
    expect(commandsForRunning(files, [])).toEqual([])
    expect(commandsForRunning([{ text: 'id: paperclip\nenabled: false\nservices:\n  - paperclipai run\n' }], ['paperclip'])).toEqual([])
  })
})
