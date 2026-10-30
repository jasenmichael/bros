import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createError } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { cliTerminalOrigin } from '../../src/server/utils/cli/terminalProxy'
import { changedVolumeHosts, dockerAppsRemounting, volumeHostPaths } from '../../src/server/utils/cli/packages'
import { dockerCommandError, shouldRunAutostart } from '../../src/server/utils/docker'
import { desktopStreamOrigin } from '../../src/server/utils/docker-app/guiProxy'

const REPO = join(import.meta.dirname, '../..')

describe('UI host split', () => {
  it('publishes the desktop stream and ttyd on localhost, not the HTTP port', () => {
    const yml = readFileSync(join(REPO, 'lib/desktop/docker-compose.yml'), 'utf8')
    const desktop = yml.slice(0, yml.indexOf('\n  bros-ui:'))
    expect(desktop).toContain('127.0.0.1:${BROS_STREAM_PORT:-3300}:3000')
    expect(desktop).toContain('127.0.0.1:${BROS_TTYD_PORT:-7681}:7681')
    expect(desktop).not.toContain('"${BROS_PORT:-3055}:${BROS_PORT:-3055}"')
    expect(yml).toContain('profiles: ["ui"]')
    expect(yml).toContain('container_name: bros-ui')
    expect(yml).toContain('BROS_DESKTOP_STREAM_ORIGIN: http://bros:3000')
    expect(yml).toContain('BROS_TERMINAL_ORIGIN: http://bros:7681')
    expect(yml).not.toContain('bros-server')
  })

  it('builds bros-ui from the pinned node stage', () => {
    const dockerfile = readFileSync(join(REPO, 'lib/desktop/Dockerfile'), 'utf8')
    expect(dockerfile).toContain('FROM node:26.7.0-bookworm-slim')
    expect(dockerfile).toContain('FROM nodetools AS ui')
    expect(dockerfile).toContain('pnpm@12.15.0')
    expect(dockerfile).not.toContain('bros-server')
    expect(existsSync(join(REPO, 'lib/desktop/root/custom-services.d/bros-server'))).toBe(false)
  })

  it('reads stream and terminal origins from env', () => {
    const prevStream = process.env.BROS_DESKTOP_STREAM_ORIGIN
    const prevTerm = process.env.BROS_TERMINAL_ORIGIN
    try {
      delete process.env.BROS_DESKTOP_STREAM_ORIGIN
      delete process.env.BROS_TERMINAL_ORIGIN
      expect(desktopStreamOrigin()).toBe('http://127.0.0.1:3000')
      expect(cliTerminalOrigin()).toBe('http://127.0.0.1:7681')
      process.env.BROS_DESKTOP_STREAM_ORIGIN = 'http://bros:3000'
      process.env.BROS_TERMINAL_ORIGIN = 'http://bros:7681'
      expect(desktopStreamOrigin()).toBe('http://bros:3000')
      expect(cliTerminalOrigin()).toBe('http://bros:7681')
    }
    finally {
      if (prevStream === undefined) delete process.env.BROS_DESKTOP_STREAM_ORIGIN
      else process.env.BROS_DESKTOP_STREAM_ORIGIN = prevStream
      if (prevTerm === undefined) delete process.env.BROS_TERMINAL_ORIGIN
      else process.env.BROS_TERMINAL_ORIGIN = prevTerm
    }
  })

  it('does not init the model submodule from the server', () => {
    const src = readFileSync(join(REPO, 'src/server/utils/internalBrosModel.ts'), 'utf8')
    expect(src).not.toContain('submodule')
  })

  it('restarts a docker app only when a shared volume host changed', () => {
    const before = 'services:\n  bros:\n    ports:\n      - "3100:3100"\n    volumes:\n      - /data/a:/a\n'
    const portsOnly = 'services:\n  bros:\n    ports:\n      - "3200:3200"\n    volumes:\n      - /data/a:/a\n'
    const added = 'services:\n  bros:\n    volumes:\n      - /data/a:/a\n      - /data/b:/b\n'
    expect(changedVolumeHosts(before, portsOnly)).toEqual([])
    expect(changedVolumeHosts(before, added)).toEqual(['/data/b'])
    expect(volumeHostPaths(before)).toEqual(['/data/a'])
    const apps = [
      { id: 'ollama', compose: 'services:\n  ollama:\n    volumes:\n      - ${BROS_HOST_DATA_DIR}/a:/a\n' },
      { id: 'whisper', compose: 'services:\n  whisper:\n    volumes:\n      - /other:/x\n' },
    ]
    expect(dockerAppsRemounting(['/srv/a'], apps, '/srv')).toEqual(['ollama'])
    expect(dockerAppsRemounting(['/data/b'], apps, '/srv')).toEqual([])
  })
})

describe('Bros image context', () => {
  it('builds from the repo checkout and recreates the one container', () => {
    const compose = readFileSync(join(REPO, 'lib/desktop/docker-compose.yml'), 'utf8')
    const dockerfile = readFileSync(join(REPO, 'lib/desktop/Dockerfile'), 'utf8')
    const packages = readFileSync(join(REPO, 'src/server/utils/cli/packages.ts'), 'utf8')
    const body = packages.slice(packages.indexOf('export async function applyCliPackages'), packages.indexOf('export type AppUpdateKind'))
    expect(body.indexOf('prepareDesktopAppBuild()')).toBeLessThan(body.indexOf('rebuildBrosContainer'))
    expect(body).toContain('writeAppsCompose(packages)')
    expect(packages).toContain('apps-compose.yml')
    expect(body).not.toContain('bros-desktop')
    expect(body).not.toContain('--pull')
    expect(body).not.toContain("'pull', '--ff-only'")
    expect(body).not.toContain('Restart to run new images')
    const hostUpdate = readFileSync(join(REPO, 'cli/src/main.rs'), 'utf8')
    const git = hostUpdate.slice(hostUpdate.indexOf('fn git_update'), hostUpdate.indexOf('fn maybe_rebuild'))
    expect(git.indexOf('--ff-only')).toBeGreaterThan(-1)
    expect(git.indexOf('--ff-only')).toBeLessThan(git.indexOf('submodule'))
    expect(git).toContain('branch == "main"')
    expect(git).toContain('branch == "master"')
    expect(git).toContain('SKIP git pull')
    expect(git).toContain('Rebuild continues without syncing remote.')
    expect(git).toContain('"submodule", "update", "--init"')
    expect(compose).toContain('context: ../..')
    expect(compose).toContain('apps: ${BROS_HOST_DATA_DIR:?unset}/build/desktop')
    expect(compose).not.toContain('dockerApps:')
    const sources = dockerfile.split('\n').flatMap((raw) => {
      const line = raw.trim()
      if (!line.startsWith('COPY ') || line.includes('--from')) return []
      const src = line.split(/\s+/)[1]
      return src && src !== '.' ? [src] : []
    })
    expect(sources).toContain('lib/desktop/install.ts')
    expect(sources).toContain('lib/desktop/desktop-gui.sh')
    for (const src of sources) {
      expect(existsSync(join(REPO, src)), src).toBe(true)
    }
    expect(dockerfile).toContain('ENV HOME=/home/bros')
    expect(dockerfile).toContain('ENV PATH="/home/bros/.local/app-bins:$PATH"')
    expect(dockerfile).not.toContain('.nix-profile/bin:')
    expect(dockerfile).not.toContain('pnpm@${PNPM_VERSION}')
    expect(dockerfile).not.toContain('bun.sh/install')
    expect(dockerfile).not.toContain('deno.land/install.sh')
    expect(dockerfile).not.toContain('astral-sh/uv/releases/download/${UV_VERSION}')
    expect(dockerfile).not.toContain('jetify-com/devbox/releases/download')
    expect(dockerfile).not.toContain('releases.nixos.org')
    expect(dockerfile).not.toContain('BROS_DEVBOX_VERSION')
    expect(compose).not.toContain('BROS_DEVBOX_VERSION')
    expect(readFileSync(join(REPO, 'docker-compose.yml'), 'utf8')).not.toContain('BROS_DEVBOX_VERSION')
    expect(dockerfile).toContain('XDG_DATA_HOME=/home/bros/.local/share')
    expect(dockerfile).not.toContain('home-dir /home/bros/.nix')
    expect(dockerfile).not.toContain('nixos.org/nix/install')
    expect(dockerfile).not.toContain('BROS_APP_BAKE')
    const live = readFileSync(join(REPO, 'lib/desktop/root/custom-cont-init.d/bros-live'), 'utf8')
    expect(live).toContain('curl -fsSL https://get.jetify.com/devbox | bash')
    expect(live).toContain('command -v devbox >/dev/null')
    expect(live).toContain('/nix/store/*-nix-*/bin/nix')
    expect(live).not.toContain('nixos.org/nix/install')
    expect(live).toContain('build-users-group =')
    expect(live).toContain('use-xdg-base-directories = true')
    expect(live).not.toContain('HOME=/home/bros/.nix')
    expect(live).not.toContain('install.ts --kind nix')
    const ensureScript = readFileSync(join(REPO, 'lib/desktop/ensure.sh'), 'utf8')
    expect(ensureScript).toContain('chown "${PUID:-1000}:${PGID:-1000}" "$HOME_DIR/.local/share/devbox"')
    expect(ensureScript).toContain('chown "$uid:$gid" /nix/store')
    expect(ensureScript).toContain('chown "$uid:$gid" "$XDG_STATE_HOME/nix"')
    expect(ensureScript).toContain('chown "$uid:$gid" /nix/var/nix/db')
    expect(ensureScript).toContain('chown "$uid:$gid" "$d"')
    expect(ensureScript).toContain('/nix/var/nix/temproots')
    expect(ensureScript).not.toContain('chown -R')
    expect(ensureScript).not.toContain('nixos.org/nix/install')
    expect(ensureScript).not.toContain('curl -fsSL https://get.jetify.com/devbox')
    expect(ensureScript).toContain('/nix/store/*-nix-*/bin/nix')
    expect(ensureScript).toContain('devbox global shellenv')
    expect(ensureScript).toContain('export PATH="/home/bros/.local/app-bins:$PATH"')
    expect(ensureScript).toContain('as_user "node $(printf \'%q\' "$INSTALL") --only')
    expect(ensureScript).not.toContain('if node "$INSTALL"')
    expect(readFileSync(join(REPO, 'lib/desktop/managers/deb.ts'), 'utf8')).toContain('sudo -n')
    expect(ensureScript).toContain('HOME="$HOME_DIR"')
    expect(ensureScript).toContain('XDG_DATA_HOME="$HOME_DIR/.local/share"')
    expect(ensureScript).not.toContain('HOME=/home/bros/.nix')
    expect(compose).toContain('${BROS_HOST_DATA_DIR:?unset}/home/nix:/nix')
    expect(compose).toContain('XDG_DATA_HOME: /home/bros/.local/share')
    expect(compose).toContain('XDG_STATE_HOME: /home/bros/.local/state')
    expect(compose).toContain('${BROS_HOST_DATA_DIR:?unset}/cache/apt/archives:/var/cache/apt/archives')
    expect(compose).toContain('${BROS_HOST_DATA_DIR:?unset}/cache/deb:/var/cache/bros/debs')
    expect(compose).toContain('${BROS_HOST_DATA_DIR:?unset}/var/logs:/var/log/bros')
    const nixManager = readFileSync(join(REPO, 'lib/desktop/managers/nix.ts'), 'utf8')
    expect(nixManager).toContain('devbox global add')
    expect(nixManager).toContain('HOME=/home/bros')
    expect(nixManager).toContain('XDG_DATA_HOME=/home/bros/.local/share')
    expect(nixManager).not.toContain('XDG_DATA_HOME=/home/bros/.nix/devbox')
    expect(nixManager).not.toContain('file:///var/cache/bros/nix')
    expect(nixManager).toContain('devbox global shellenv')
    expect(nixManager).not.toContain('.nix-profile/bin')
    expect(nixManager).not.toContain('nix profile install')
    expect(nixManager).not.toContain('get.jetify.com')
    const host = readFileSync(join(REPO, 'cli/src/main.rs'), 'utf8')
    expect(host).toContain('fn choose_ui(source: bool, dev: bool, pnpm: bool)')
    expect(host).toContain('cli/Cargo.toml')
    const install = readFileSync(join(REPO, 'src/website/public/install.sh'), 'utf8')
    expect(install).toContain('--from-src')
    expect(install).toContain('BROS_RELEASE_URL')
    const unpack = install.slice(0, install.indexOf('from_src()'))
    expect(unpack).not.toContain('git clone')
    const pack = readFileSync(join(REPO, 'scripts/pack-release.sh'), 'utf8')
    expect(pack).toContain('cli/')
    expect(pack).toContain('data')
    expect(host).toContain('"-v"')
    expect(host).toContain('26.7.0')
    expect(host).toContain('cache/apt/archives')
    expect(host).toContain('cache/deb')
    expect(host).toContain('home/nix')
    expect(readFileSync(join(REPO, 'lib/desktop/install.ts'), 'utf8')).not.toContain('get.jetify.com')
    expect(dockerfile).not.toContain('xpra')
  })
})

describe('dockerApp autostart and start errors', () => {
  it('does not autostart during prerender or without host data dir', () => {
    expect(shouldRunAutostart(true)).toBe(false)
    const prev = process.env.BROS_HOST_DATA_DIR
    try {
      delete process.env.BROS_HOST_DATA_DIR
      expect(shouldRunAutostart(false)).toBe(false)
      process.env.BROS_HOST_DATA_DIR = '/tmp/bros-data'
      expect(shouldRunAutostart(false)).toBe(true)
    }
    finally {
      if (prev === undefined) delete process.env.BROS_HOST_DATA_DIR
      else process.env.BROS_HOST_DATA_DIR = prev
    }
    const middleware = readFileSync(join(REPO, 'src/server/middleware/01-auth.ts'), 'utf8')
    expect(middleware).toContain('shouldRunAutostart() && !autostartDone')
  })

  it('puts docker output in message so h3 does not warn on statusMessage', () => {
    const detail = 'failed to solve: "/core/desktop/install.mjs": not found\n#27 ERROR'
    const body = dockerCommandError(500, 'Failed to start dockerApp', detail)
    expect(body.statusMessage).toBe('Failed to start dockerApp')
    expect(body.message).toBe(detail)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const err = createError(body)
      expect(err.statusMessage).toBe('Failed to start dockerApp')
      expect(err.message).toContain('core/desktop/install.mjs')
      expect(warn).not.toHaveBeenCalled()
    }
    finally {
      warn.mockRestore()
    }
  })
})

describe('workspace package scripts', () => {
  it('ui:dev runs the app filter from src/', () => {
    const pkg = JSON.parse(readFileSync(join(REPO, 'src/package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.dev).toBeUndefined()
    expect(pkg.scripts['dev:update']).toBeUndefined()
    expect(pkg.scripts['ui:dev']).toBe('pnpm --filter @bros/ui dev')
  })
})

describe('install.sh next steps', () => {
  it('does not mention --dev', () => {
    const sh = readFileSync(join(REPO, 'src/website/public/install.sh'), 'utf8')
    expect(sh).not.toContain('--dev')
    expect(sh).toContain('BROS_HOME')
    expect(sh).toContain('BROS_BIN')
    expect(sh).toContain('--service')
  })
})
