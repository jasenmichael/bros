import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { enabledAppsDir } from '../../app/server/utils/cli/packages'
import { loadBootstrapConfig } from '../../app/server/utils/config'
import { defaultDockerAppAutostart, shouldAutostartDockerApp } from '../../app/server/utils/docker-app/dockerApps'

const root = join(import.meta.dirname, '../..')

describe('desktop window and enabled dockerApp autostart', () => {
  it('does not start a dockerApp from desktop open, and autostarts enabled dockerApps', () => {
    const source = readFileSync(join(root, 'app/server/api/apps/[id]/start.post.ts'), 'utf8')
    const guiAt = source.indexOf('if (body?.gui)')
    const branch = source.slice(guiAt, source.indexOf('return startDockerApp', guiAt))
    expect(branch).toContain('ensureDockerAppGui')
    expect(branch).toContain('DockerApp is not running')
    expect(branch).not.toContain('startDockerApp')

    const stop = readFileSync(join(root, 'app/server/api/apps/[id]/stop.post.ts'), 'utf8')
    const stopBranch = stop.slice(stop.indexOf('if (body?.gui)'), stop.indexOf('return stopDockerApp'))
    expect(stopBranch).toContain('stopGuiSession')
    expect(stopBranch).not.toContain('stopDockerApp(')

    const boot = readFileSync(join(root, 'app/server/utils/docker.ts'), 'utf8')
    const autostart = boot.slice(boot.indexOf('export async function autostartDockerApps'))
    expect(autostart).toContain('shouldAutostartDockerApp')
    expect(autostart).toContain('isCoreAppEnabled')

    expect(shouldAutostartDockerApp({ id: 'cursor', interfaces: [{ type: 'gui' }] }, { autostart: true })).toBe(true)
    expect(shouldAutostartDockerApp({ id: 'opencode' }, { autostart: true })).toBe(true)
    expect(shouldAutostartDockerApp({ id: 'mine', disabled: false }, { autostart: true })).toBe(true)
    expect(shouldAutostartDockerApp({ id: 'cursor', disabled: true }, { autostart: true })).toBe(false)
    expect(shouldAutostartDockerApp({ id: 'pi' }, { autostart: false })).toBe(false)
    expect(defaultDockerAppAutostart('cursor')).toBe(false)
    expect(defaultDockerAppAutostart('opencode')).toBe(false)
    expect(defaultDockerAppAutostart('ollama')).toBe(true)
    expect(defaultDockerAppAutostart('whisper')).toBe(false)
    expect(defaultDockerAppAutostart('desktop')).toBe(false)
    expect(shouldAutostartDockerApp({ id: 'whisper' }, { autostart: true })).toBe(false)
  })

  it('writes the desktop build under the data dir', () => {
    expect(enabledAppsDir()).toBe(join(loadBootstrapConfig().dataDir, 'build', 'desktop'))
  })
})
