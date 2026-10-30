import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(import.meta.dirname, '../..')

function usageText(raw: string) {
  const lines = raw.split('\n')
  if (lines[0] !== '---') return raw
  const end = lines.indexOf('---', 1)
  return lines.slice(end + 1).join('\n').replace(/^\n/, '')
}

describe('help text', () => {
  it('is docs/cli.md with the frontmatter removed', () => {
    const raw = readFileSync(join(REPO, 'docs/cli.md'), 'utf8')
    const text = usageText(raw)
    expect(text.startsWith('---')).toBe(false)
    expect(text).toContain('shell')
    expect(text).toContain('run')
    const help = execFileSync(join(REPO, 'bros'), ['--help'], { encoding: 'utf8' })
    expect(help.trim()).toBe(text.trim())
  })
})
