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
    const { resetPasskeyPrintForTests } = await import('../../src/server/utils/auth')
    resetDbForTests()
    resetPasskeyPrintForTests()
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

  it('persists passkey file as source of truth', async () => {
    const { readFileSync } = await import('node:fs')
    const {
      ensurePasskey,
      verifyPasscode,
      setPasscode,
      passkeyPath,
      hasPasscode,
      readPasskey,
    } = await import('../../src/server/utils/auth')

    expect(hasPasscode()).toBe(false)
    const generated = ensurePasskey()
    expect(generated.length).toBeGreaterThanOrEqual(4)
    expect(readFileSync(passkeyPath(), 'utf8').trim()).toBe(generated)
    expect(verifyPasscode(generated)).toBe(true)
    expect(verifyPasscode('wrong')).toBe(false)

    setPasscode('ui-changed-key')
    expect(readPasskey()).toBe('ui-changed-key')
    expect(readFileSync(passkeyPath(), 'utf8').trim()).toBe('ui-changed-key')
    expect(verifyPasscode('ui-changed-key')).toBe(true)
    expect(verifyPasscode(generated)).toBe(false)

    // Second ensure keeps existing file
    expect(ensurePasskey()).toBe('ui-changed-key')
  })

  it('rejects missing tokens', async () => {
    const { isSessionValid } = await import('../../src/server/utils/auth')
    expect(isSessionValid(null)).toBe(false)
    expect(isSessionValid(undefined)).toBe(false)
    expect(isSessionValid('')).toBe(false)
  })

  it('sets Secure session cookie when Host is public_url / CF-looking request', async () => {
    const { requestIsHttps, sessionCookieOptions, SESSION_COOKIE } = await import('../../src/server/utils/auth')
    const { hostnameFromPublicUrl, isViaTunnel } = await import('../../src/server/utils/viaTunnel')
    const host = hostnameFromPublicUrl('https://bros.jasenmichael.com')
    const viaTunnel = isViaTunnel({
      host,
      tunnelHost: host,
      headers: {
        'cf-ray': '8a1b2c3d4e5f6a7b-EWR',
        'cf-visitor': '{"scheme":"https"}',
        'x-forwarded-proto': 'https',
      },
    })
    expect(viaTunnel).toBe(true)
    const opts = sessionCookieOptions(requestIsHttps({
      protocol: 'http',
      forwardedProto: 'https,http',
      cfVisitor: '{"scheme":"https"}',
      viaTunnel,
    }))
    expect(opts.secure).toBe(true)
    expect(opts.httpOnly).toBe(true)
    expect(opts.sameSite).toBe('lax')
    expect(opts.path).toBe('/')
    expect(opts).not.toHaveProperty('domain')
    const { serialize } = await import('cookie-es')
    const header = serialize(SESSION_COOKIE, 'session-token', opts)
    expect(header).toMatch(/Secure/i)
    expect(header).not.toMatch(/Domain=/i)
  })

  it('keeps session cookie not Secure on local HTTP', async () => {
    const { requestIsHttps, sessionCookieOptions, SESSION_COOKIE } = await import('../../src/server/utils/auth')
    const opts = sessionCookieOptions(requestIsHttps({
      protocol: 'http',
      forwardedProto: null,
      cfVisitor: null,
      viaTunnel: false,
    }))
    expect(opts.secure).toBe(false)
    const { serialize } = await import('cookie-es')
    expect(serialize(SESSION_COOKIE, 'session-token', opts)).not.toMatch(/Secure/i)
  })

  it('marks HTTPS from via-tunnel even when forwarded proto is missing', async () => {
    const { requestIsHttps, sessionCookieOptions } = await import('../../src/server/utils/auth')
    const { isViaTunnel } = await import('../../src/server/utils/viaTunnel')
    const viaTunnel = isViaTunnel({
      host: 'lucky-river-1234.trycloudflare.com',
      headers: { 'cf-ray': '8a1b2c3d4e5f6a7b-EWR' },
    })
    expect(viaTunnel).toBe(true)
    expect(sessionCookieOptions(requestIsHttps({ protocol: 'http', viaTunnel })).secure).toBe(true)
  })
})
