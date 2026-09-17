import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(import.meta.dirname, '../..')
const BROS = join(REPO, 'bros')

function extractFn(src: string, name: string) {
  const m = src.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'))
  if (!m) throw new Error(`missing ${name}()`)
  return m[0]
}

function bash(script: string) {
  return execFileSync('bash', ['-c', script], { encoding: 'utf8' })
}

function runComposeUp(dev: 0 | 1, extra = '-d') {
  const fn = extractFn(readFileSync(BROS, 'utf8'), 'compose_up')
  return bash(
    `set -euo pipefail
     DEV=${dev}
     compose() { printf 'compose %s\\n' "$*"; }
     ${fn}
     compose_up ${extra}`,
  ).trim()
}

describe('bros CLI start build policy', () => {
  it('dev compose_up omits --build', () => {
    expect(runComposeUp(1)).toBe('compose up -d')
  })

  it('prod compose_up keeps --build', () => {
    expect(runComposeUp(0)).toBe('compose up --build -d')
  })

  it('cmd_start uses compose_up', () => {
    const start = extractFn(readFileSync(BROS, 'utf8'), 'cmd_start')
    expect(start).toMatch(/compose_up /)
    expect(start).not.toMatch(/compose up --build/)
  })

  it('update still pulls and rebuilds', () => {
    const update = extractFn(readFileSync(BROS, 'utf8'), 'cmd_update')
    expect(update).toContain('compose pull')
    expect(update).toContain('compose build --pull')
  })
})
