import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shouldWriteDesktopStamp } from '../../src/server/utils/cli/packages'

const root = join(import.meta.dirname, '../..')

describe('desktop rebuild', () => {
  it('stamps a finished build and skips a failed one', () => {
    expect(shouldWriteDesktopStamp(true, false, true)).toBe(true)
    expect(shouldWriteDesktopStamp(true, true, true)).toBe(false)
    expect(shouldWriteDesktopStamp(false, false, false)).toBe(true)
    expect(shouldWriteDesktopStamp(false, false, true)).toBe(false)
  })

  it('force-recreates only when the apps compose file changes', () => {
    const packages = readFileSync(join(root, 'src/server/utils/cli/packages.ts'), 'utf8')
    const docker = readFileSync(join(root, 'src/server/utils/docker.ts'), 'utf8')
    expect(packages).toContain('forceRecreate: changed')
    expect(packages).not.toContain("forceRecreate: action === 'recreate'")
    expect(docker).not.toContain('if (build) forceRecreate = true')
  })

  it('names the session gaps', () => {
    const script = readFileSync(join(root, 'lib/sidecars/core/desktop/desktop-ready.sh'), 'utf8')
    expect(script).toContain("gaps.push('selkies')")
    expect(script).toContain("gaps.push('ttyd')")
    expect(script).toContain("gaps.push('x11')")
    expect(script).toContain("gaps.push('wayland')")
    expect(script).toContain("gaps.join(' ')")
    expect(script).toContain('/tmp/.X11-unix/X0')
    expect(script).toContain('/home/bros/.XDG/wayland-0')
  })
})
