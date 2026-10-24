import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')

describe('pnpm 12 install', () => {
  it('skips the registry recheck and the pre-script install', () => {
    const workspace = readFileSync(join(root, 'src/pnpm-workspace.yaml'), 'utf8')
    expect(workspace).toMatch(/^minimumReleaseAge:\s*0$/m)
    expect(workspace).toMatch(/^verifyDepsBeforeRun:\s*false$/m)
  })
})
