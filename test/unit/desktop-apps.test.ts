import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appsComposeBody, catalogRoot, desktopAppsDockerfile, parseCliPackage, parseServices, readCatalog } from '../../src/server/utils/cli/packages'
import { ensurePackages, presentBins } from '../../src/server/utils/cli/ensure'
import { bumpedRestartIds, commandsForRunning, runningIds, servicesFromYaml } from '../../lib/desktop/app-services/supervise.ts'
import { listedPackageApp, listedDockerApp } from '../../src/ui/utils/gui'

const root = join(import.meta.dirname, '../..')

const paperclip = 'id: paperclip\nenabled: true\nservices:\n  - script: serve.sh\n'
const jq = 'id: jq\nkind: apt\n'

describe('desktop package apps', () => {
  it('leaves paperclip disabled and publishes 3100 only when enabled', () => {
    const catalog = readCatalog()
    const paperclip = catalog.find((pkg) => pkg.id === 'paperclip')
    expect(paperclip?.tier).toBe('addon')
    expect(paperclip?.enabled).toBe(false)
    expect(paperclip?.services?.[0]?.command).toBe('paperclipai run')
    expect(paperclip?.services?.[0]?.script).toBeUndefined()
    expect(existsSync(join(root, 'lib/apps/addon/paperclip/serve.sh'))).toBe(false)
    expect(appsComposeBody(catalog)).not.toContain('3100')
    expect(appsComposeBody(catalog)).not.toContain('4097')
    const opencode = catalog.find((pkg) => pkg.id === 'opencode')
    expect(opencode?.enabled).toBe(false)
    expect(opencode?.services?.[0]?.command).toBe('opencode serve --hostname 0.0.0.0 --port 4096')
    expect(existsSync(join(root, 'lib/apps/addon/opencode/serve.sh'))).toBe(false)
    const enabled = catalog.map((pkg) => pkg.id === 'paperclip' || pkg.id === 'opencode' ? { ...pkg, enabled: true } : pkg)
    const body = appsComposeBody(enabled)
    expect(body).toContain('3100:3100')
    expect(body).toContain('4096:4096')
    expect(body).toMatch(/services:\n  bros:\n/)
    expect(body).not.toMatch(/services:\n  desktop:\n/)
    expect(appsComposeBody(enabled.map((pkg) => pkg.id === 'paperclip' ? { ...pkg, forwardHost: false } : pkg))).not.toContain('3100:3100')
  })

  it('does not install packages from the desktop init script', () => {
    const init = readFileSync(join(root, 'lib/desktop/root/custom-cont-init.d/bros-live'), 'utf8')
    const dockerfile = readFileSync(join(root, 'lib/desktop/Dockerfile'), 'utf8')
    expect(init).not.toContain('install.ts --kind nix')
    expect(init).not.toContain('nixos.org/nix/install')
    expect(init).toContain('use-xdg-base-directories = true')
    expect(init).not.toContain('BROS_IMAGE_INSTALL')
    expect(dockerfile).toContain('FROM ghcr.io/linuxserver/baseimage-selkies:ubunturesolute-4eb74d68-ls53@sha256:beebd1f142f792e9767780a70cbc6c41c6c448e12fcda4504417404f1f118df3')
    expect(dockerfile).not.toContain('nodebin')
    expect(dockerfile).not.toContain('BROS_IMAGE_INSTALL=1')
    expect(dockerfile).not.toContain('COPY --from=nodebin')
    expect(dockerfile).not.toContain('paperclip.sh')
    const layers = desktopAppsDockerfile(dockerfile, [
      { id: 'cursor', tier: 'addon', kind: 'deb' },
      { id: 'node', tier: 'core', kind: 'nix' },
      { id: 'agent', tier: 'addon', kind: 'run' },
      { id: 'pnpm', tier: 'core', kind: 'nix' },
      { id: 'demo', tier: 'custom', kind: 'run' },
    ])
    expect([...layers.matchAll(/--only (\S+)/g)].map((match) => match[1])).toEqual(['agent', 'demo'])
    expect(layers).not.toContain('--only node')
    expect(layers).not.toContain('--only pnpm')
    expect(layers).toContain('COPY --from=apps agent /opt/bros/enabled-apps/agent')
    expect(layers).toContain('COPY --from=apps demo /opt/bros/enabled-apps/demo')
    expect(layers).toContain('/usr/local/bin/node /opt/bros/install.ts --only agent')
    expect(layers).not.toContain('from=brosnode')
    expect(layers).not.toContain('from=nodebin')
    expect(layers).toContain('id=bros-pkg')
    const compose = readFileSync(join(root, 'lib/desktop/docker-compose.yml'), 'utf8')
    expect(compose).toContain('context: .')
    expect(compose).toContain('${BROS_DATA_DIR:?unset}/build/desktop')
    expect(compose).not.toContain('dockerApps:')
    expect(compose).not.toContain('brosnode:')
    expect(dockerfile).toContain('node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32')
  })

  it('reads shipped apps from config.yml', () => {
    const ids = readCatalog().map((pkg) => pkg.id).sort()
    expect(ids).toEqual(['agent', 'bun', 'cargo', 'claude', 'cursor', 'deno', 'ghostty', 'jq', 'node', 'opencode', 'paperclip', 'pnpm', 'uv'])
    const node = readCatalog().find((pkg) => pkg.id === 'node')
    expect(node?.name).toBe('Node')
    expect(node?.kind).toBe('nix')
    expect(node?.clis).toEqual(['node', 'npm', 'npx'])
    expect(presentBins(node || { id: 'node' })).toEqual(['node', 'npm', 'npx'])
    const cargo = readCatalog().find((pkg) => pkg.id === 'cargo')
    expect(cargo?.clis).toEqual(['cargo', 'rustc'])
    expect(presentBins({ id: 'uv', bin: 'uv' })).toEqual(['uv'])
    expect(presentBins({ id: 'jq' })).toEqual([])
    const order = ensurePackages(readCatalog().map((pkg) => pkg.id === 'jq' || pkg.id === 'opencode' ? { ...pkg, enabled: true } : pkg))
    expect(order.map((pkg) => pkg.id).slice(0, 6)).toEqual(['node', 'cargo', 'uv', 'bun', 'pnpm', 'deno'])
    expect(order.map((pkg) => pkg.id)).toContain('jq')
    expect(order.map((pkg) => pkg.id)).toContain('opencode')
    const withPaperclip = ensurePackages(readCatalog().map((pkg) => pkg.id === 'paperclip' ? { ...pkg, enabled: true } : pkg))
    expect(withPaperclip.map((pkg) => pkg.id)).toContain('paperclip')
    expect(order.map((pkg) => pkg.id)).not.toContain('agent')
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
    expect(servicesFromYaml('services:\n  - command: paperclipai run\n    cwd: /home/bros\n')).toEqual([{ command: 'paperclipai run', cwd: '/home/bros' }])
    expect(servicesFromYaml('services:\n  - script: serve.sh\n')).toEqual([{ command: 'serve.sh', script: 'serve.sh' }])
    expect(parseServices([{ script: 'serve.sh' }])).toEqual([{ command: 'serve.sh', script: 'serve.sh' }])
    expect(parseCliPackage({ kind: 'run', spec: 'curl -fsSL https://example.com/install | sh', uninstall: 'uninstall.sh' }).uninstall).toBe('uninstall.sh')
  })

  it('keeps a disabled dockerApp and a disabled package off Desktop and Terminal', () => {
    expect(listedDockerApp({ disabled: true })).toBe(false)
    expect(listedDockerApp({ disabled: false })).toBe(true)
    expect(listedPackageApp({ enabled: false })).toBe(false)
    expect(listedPackageApp({ enabled: true })).toBe(true)
    expect(readFileSync(join(root, 'lib/desktop/install.ts'), 'utf8')).not.toContain("['npm', 'pnpm', 'bun']")
  })

  it('opens the app library from the Drawer and sends the Apps panel cog to /apps', () => {
    const page = readFileSync(join(root, 'src/ui/pages/desktop.vue'), 'utf8')
    const drawer = readFileSync(join(root, 'src/ui/components/DesktopDrawer.vue'), 'utf8')
    const cardAt = page.indexOf('max-h-[85vh]')
    const card = page.slice(cardAt, page.indexOf('</NuxtLink>', cardAt))
    expect(page).toContain('DesktopDrawer')
    expect(page).not.toContain('>Apps</button>')
    expect(drawer).toContain('Show apps')
    expect(drawer).toContain('translate-y-full')
    expect(drawer).toContain('DesktopGridIcon')
    expect(drawer).toContain('All apps')
    expect(drawer).toContain('Unpin')
    expect(drawer).toContain('New window')
    expect(drawer).toContain('Close window')
    expect(drawer).toContain('app.pinId || app.windows > 0')
    expect(drawer).toContain("run(app, app.windows > 0 ? 'focus' : 'open')")
    expect(drawer).not.toContain('Desktop settings')
    expect(drawer).not.toContain("$emit('settings')")
    expect(page).not.toContain("panel = 'board'")
    expect(page).not.toContain('DesktopAppsBoard')
    expect(page).toContain('DesktopAppLibrary')
    expect(page).toContain("@opened=\"panel = ''\"")
    expect(page).toContain("@click.self=\"panel = ''\"")
    expect(page.slice(0, cardAt)).not.toContain('bottom-2 right-2')
    expect(card).toContain('DesktopAppLibrary')
    expect(card).not.toContain('>Apps</p>')
    expect(card).not.toContain('border-b')
    expect(card).toContain('bottom-2 right-2')
    expect(card).toContain('h-10 w-10')
    expect(card).toContain('aria-label="Apps"')
    expect(card).toContain('to="/apps"')
    expect(page.slice(page.indexOf('</NuxtLink>'))).not.toContain('bottom-2 right-2')
    const library = readFileSync(join(root, 'src/ui/components/DesktopAppLibrary.vue'), 'utf8')
    expect(library).toContain('max-w-xs')
    expect(library).toContain('i-lucide-search')
    expect(library).toContain('justify-center')
    expect(existsSync(join(root, 'src/ui/pages/settings/desktop/index.vue'))).toBe(true)
    expect(existsSync(join(root, 'src/ui/pages/settings/desktop.vue'))).toBe(false)
    const settings = readFileSync(join(root, 'src/ui/pages/settings/desktop/index.vue'), 'utf8')
    expect(settings).toContain("navigateTo('/apps'")
    const logs = readFileSync(join(root, 'src/ui/pages/settings/desktop/[id]/logs.vue'), 'utf8')
    expect(logs).toContain('/apps/${route.params.id}/logs')
    expect(logs).not.toContain('role=package')
    const docker = readFileSync(join(root, 'src/server/utils/docker.ts'), 'utf8')
    const session = docker.indexOf('waitForDesktopSession()')
    expect(docker.slice(session, session + 500)).toContain('queueDesktopEnsure()')
    expect(docker.slice(session, session + 500)).not.toContain('await queueDesktopEnsure')
    expect(docker).not.toContain('await queueDesktopEnsure')
    expect(existsSync(join(root, 'src/ui/pages/settings/apps.vue'))).toBe(false)
  })

  it('launches a services command only when its id is in the running set', () => {
    const files = [{ text: paperclip }, { text: jq }]
    expect(runningIds('{"ids":["paperclip"]}')).toEqual(['paperclip'])
    expect(runningIds('')).toEqual([])
    expect(commandsForRunning(files, ['paperclip'])).toEqual([{ id: 'paperclip', command: './serve.sh' }])
    expect(bumpedRestartIds({ paperclip: 1 }, { paperclip: 2 })).toEqual(['paperclip'])
    expect(bumpedRestartIds({}, { paperclip: 1 })).toEqual([])
    expect(commandsForRunning([{ text: 'id: demo\nservices:\n  - script: serve.sh\n', dir: '/opt/bros/enabled-apps/demo' }], ['demo'])).toEqual([{ id: 'demo', command: './serve.sh', cwd: '/opt/bros/enabled-apps/demo' }])
    expect(commandsForRunning([{ text: 'id: paperclip\nservices:\n  - command: paperclipai run\n    cwd: /home/bros\n', dir: '/app/lib/apps/addon/paperclip' }], ['paperclip'])).toEqual([{ id: 'paperclip', command: 'paperclipai run', cwd: '/home/bros' }])
    expect(commandsForRunning(files, [])).toEqual([])
    expect(commandsForRunning([{ text: 'id: paperclip\nenabled: false\nservices:\n  - paperclipai run\n' }], ['paperclip'])).toEqual([])
  })
})
