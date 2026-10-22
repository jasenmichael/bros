import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { enabledAppsDir } from '../../src/server/utils/cli/packages'
import { loadBootstrapConfig } from '../../src/server/utils/config'
import { defaultSidecarAutostart, shouldAutostartSidecar } from '../../src/server/utils/sidecars/sidecars'

const root = join(import.meta.dirname, '../..')

describe('desktop window and enabled sidecar autostart', () => {
  it('does not start a sidecar from desktop open, and autostarts enabled sidecars', () => {
    const source = readFileSync(join(root, 'src/server/api/sidecars/[id]/start.post.ts'), 'utf8')
    const guiAt = source.indexOf('if (body?.gui)')
    const branch = source.slice(guiAt, source.indexOf('return startSidecar', guiAt))
    expect(branch).toContain('ensureSidecarGui')
    expect(branch).toContain('Sidecar is not running')
    expect(branch).not.toContain('startSidecar')

    const stop = readFileSync(join(root, 'src/server/api/sidecars/[id]/stop.post.ts'), 'utf8')
    const stopBranch = stop.slice(stop.indexOf('if (body?.gui)'), stop.indexOf('return stopSidecar'))
    expect(stopBranch).toContain('stopGuiSession')
    expect(stopBranch).not.toContain('stopSidecar(')

    const boot = readFileSync(join(root, 'src/server/utils/docker.ts'), 'utf8')
    const autostart = boot.slice(boot.indexOf('export async function autostartSidecars'))
    expect(autostart).toContain('shouldAutostartSidecar')

    expect(shouldAutostartSidecar({ id: 'cursor', interfaces: [{ type: 'gui' }] }, { autostart: true })).toBe(true)
    expect(shouldAutostartSidecar({ id: 'opencode' }, { autostart: true })).toBe(true)
    expect(shouldAutostartSidecar({ id: 'mine', disabled: false }, { autostart: true })).toBe(true)
    expect(shouldAutostartSidecar({ id: 'cursor', disabled: true }, { autostart: true })).toBe(false)
    expect(shouldAutostartSidecar({ id: 'pi' }, { autostart: false })).toBe(false)
    expect(defaultSidecarAutostart('cursor')).toBe(false)
    expect(defaultSidecarAutostart('opencode')).toBe(false)
    expect(defaultSidecarAutostart('ollama')).toBe(true)
    expect(defaultSidecarAutostart('desktop')).toBe(true)
    expect(shouldAutostartSidecar({ id: 'whisper' }, { autostart: true })).toBe(false)
  })

  it('writes enabled-apps on the host repo, and on the app directory when that env is unset', () => {
    const prev = process.env.BROS_HOST_REPO
    try {
      process.env.BROS_HOST_REPO = '/srv/bros-host'
      expect(enabledAppsDir()).toBe('/srv/bros-host/lib/sidecars/core/desktop/enabled-apps')
      process.env.BROS_HOST_REPO = '   '
      expect(enabledAppsDir()).toBe(join(loadBootstrapConfig().workingDir, 'lib', 'sidecars', 'core', 'desktop', 'enabled-apps'))
      delete process.env.BROS_HOST_REPO
      expect(enabledAppsDir()).toBe(join(loadBootstrapConfig().workingDir, 'lib', 'sidecars', 'core', 'desktop', 'enabled-apps'))
    } finally {
      if (prev == null) delete process.env.BROS_HOST_REPO
      else process.env.BROS_HOST_REPO = prev
    }
  })
})
