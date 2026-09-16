import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('auth session helpers', () => {
  let dataDir = ''

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-auth-'))
    process.env.BROS_DATA_DIR = dataDir
    process.env.BROS_WORKING_DIR = dataDir
    process.env.BROS_SESSION_SECRET = 'test-secret-for-unit-tests'
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
  })

  afterEach(async () => {
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('creates a session that validates until destroyed', async () => {
    const { setPasscode, createSession, isSessionValid, destroySession } = await import('../../src/server/utils/auth')
    setPasscode('correct-horse')
    const token = createSession()
    expect(isSessionValid(token)).toBe(true)
    destroySession(token)
    expect(isSessionValid(token)).toBe(false)
  })

  it('rejects missing tokens', async () => {
    const { isSessionValid } = await import('../../src/server/utils/auth')
    expect(isSessionValid(null)).toBe(false)
    expect(isSessionValid(undefined)).toBe(false)
    expect(isSessionValid('')).toBe(false)
  })
})
