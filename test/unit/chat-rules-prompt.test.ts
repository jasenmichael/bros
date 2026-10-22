import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

describe('chat rules prompt', () => {
  let dataDir = ''
  const envKeys = ['BROS_DIR', 'BROS_HOME', 'BROS_WORKING_DIR', 'BROS_DATA_DIR', 'BROS_HOST_HOME'] as const
  const prev: Partial<Record<(typeof envKeys)[number], string | undefined>> = {}

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-chat-rules-'))
    for (const key of envKeys) prev[key] = process.env[key]
    process.env.BROS_DIR = repoRoot
    process.env.BROS_HOME = repoRoot
    process.env.BROS_WORKING_DIR = repoRoot
    process.env.BROS_DATA_DIR = dataDir
    delete process.env.BROS_HOST_HOME
  })

  afterEach(() => {
    for (const key of envKeys) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
    }
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('loads rules that deny tools and does not load the chat task file', async () => {
    const { personaSystemText, withPersona } = await import('../../src/server/utils/skills')
    const text = personaSystemText()
    expect(text).toContain('You have no tools.')
    expect(text).toContain('Do not pretend to browse, read files, or run commands.')
    expect(text).not.toContain('If a tool fails')
    expect(text).not.toContain('Mode: chat.')
    const messages = withPersona([{ role: 'user', content: 'can you search the web?' }])
    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content).toContain('You have no tools.')
    expect(messages.some((m) => m.content.includes('browser tool'))).toBe(false)
  })
})
