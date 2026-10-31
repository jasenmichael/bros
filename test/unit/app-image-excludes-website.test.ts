import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('app image excludes the website', () => {
  it('keeps @bros/website out of the image build and dev cache', () => {
    const dockerfile = read('lib/desktop/Dockerfile')
    const entry = read('scripts/docker/dev-entrypoint.sh')
    expect(read('.dockerignore')).toMatch(/^app\/website$/m)
    expect(dockerfile).not.toContain('app/website')
    expect(dockerfile).not.toContain('@bros/cli')
    expect(entry).toContain('--filter "@bros/ui..."')
    expect(entry).not.toContain('@bros/cli')
    expect(entry).toContain('flock 9')
    expect(entry).toContain('.bros-install.lock')
    expect(read('lib/desktop/docker-compose.dev.yml')).not.toContain('bros-website-modules')
    expect(read('app/pnpm-workspace.yaml')).toContain('website')
  })
})
