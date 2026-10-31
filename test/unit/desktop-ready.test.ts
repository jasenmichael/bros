import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shouldWriteDesktopStamp } from '../../app/server/utils/cli/packages'

const root = join(import.meta.dirname, '../..')

describe('desktop rebuild', () => {
  it('stamps a finished build and skips a failed one', () => {
    expect(shouldWriteDesktopStamp(true, false, true)).toBe(true)
    expect(shouldWriteDesktopStamp(true, true, true)).toBe(false)
    expect(shouldWriteDesktopStamp(false, false, false)).toBe(true)
    expect(shouldWriteDesktopStamp(false, false, true)).toBe(false)
  })

  it('force-recreates only when the apps compose file changes', () => {
    const packages = readFileSync(join(root, 'app/server/utils/cli/packages.ts'), 'utf8')
    const docker = readFileSync(join(root, 'app/server/utils/docker.ts'), 'utf8')
    expect(packages).toContain('forceRecreate: changed')
    expect(packages).not.toContain("forceRecreate: action === 'recreate'")
    expect(docker).not.toContain('if (build) forceRecreate = true')
  })

  it('names the session gaps', () => {
    const script = readFileSync(join(root, 'lib/desktop/desktop-ready.sh'), 'utf8')
    expect(script).not.toContain('exec node')
    expect(script).toContain('selkies')
    expect(script).toContain('ttyd')
    expect(script).toContain('x11')
    expect(script).toContain('wayland')
    expect(script).toContain('/tmp/.X11-unix/X0')
    expect(script).toContain('/home/bros/.XDG/wayland-0')
  })
})
