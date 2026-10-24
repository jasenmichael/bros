import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('app image excludes the website', () => {
  it('keeps @bros/website out of the image build and dev cache', () => {
    const dockerfile = read('Dockerfile')
    const entry = read('docker/dev-entrypoint.sh')
    expect(read('.dockerignore')).toMatch(/^src\/website$/m)
    expect(dockerfile).not.toContain('src/website')
    expect(dockerfile).toContain('--filter "@bros/ui..." --filter "@bros/cli..."')
    expect(entry).toContain('--filter "@bros/ui..." --filter "@bros/cli..."')
    expect(read('docker-compose.dev.yml')).not.toContain('bros-website-modules')
    expect(read('src/pnpm-workspace.yaml')).toContain('website')
  })
})
