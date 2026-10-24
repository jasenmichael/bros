import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ignoreUnbuiltCpuFeatures } from '../../src/ui/nitroTrace'

const root = join(import.meta.dirname, '../..')

describe('pnpm 12 hoist', () => {
  it('puts public hoist in the workspace file, not .npmrc', () => {
    const workspace = readFileSync(join(root, 'src/pnpm-workspace.yaml'), 'utf8')
    const npmrc = readFileSync(join(root, 'src/.npmrc'), 'utf8')
    expect(workspace).toMatch(/^shamefullyHoist:\s*true$/m)
    expect(workspace).toMatch(/^strictPeerDependencies:\s*false$/m)
    expect(workspace).toMatch(/^minimumReleaseAge:\s*0$/m)
    expect(workspace).toMatch(/^verifyDepsBeforeRun:\s*false$/m)
    expect(npmrc).not.toMatch(/shamefully-hoist|shamefullyHoist|strict-peer-dependencies|strictPeerDependencies/)
  })

  it('does not build ssh2 cpu-features and keeps Nitro off that path', () => {
    const workspace = readFileSync(join(root, 'src/pnpm-workspace.yaml'), 'utf8')
    const nuxt = readFileSync(join(root, 'src/ui/nuxt.config.ts'), 'utf8')
    expect(workspace).toMatch(/^  cpu-features:\s*false$/m)
    expect(nuxt).toMatch(/ignore:\s*ignoreUnbuiltCpuFeatures/)
    expect(ignoreUnbuiltCpuFeatures(
      '/app/src/node_modules/.pnpm/ssh2@1.17.0/node_modules/cpu-features',
    )).toBe(true)
    expect(ignoreUnbuiltCpuFeatures(
      'node_modules/.pnpm/cpu-features@0.0.10/node_modules/cpu-features/lib/index.js',
    )).toBe(true)
    expect(ignoreUnbuiltCpuFeatures('node_modules/better-sqlite3/lib/database.js')).toBe(false)
  })
})
