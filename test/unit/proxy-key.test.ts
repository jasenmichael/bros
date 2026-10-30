import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { proxyPublicOrigin } from '../../src/server/utils/auth'
import { matchPublicProxyTarget, proxyRequestAuthorized, type PublicProxyTarget } from '../../src/server/utils/docker-app/dockerAppProxy'

describe('proxy key', () => {
  let dataDir = ''
  const prevData = process.env.BROS_DATA_DIR
  const prevWork = process.env.BROS_WORKING_DIR

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-proxy-key-'))
    process.env.BROS_DATA_DIR = dataDir
    process.env.BROS_WORKING_DIR = dataDir
  })

  afterEach(() => {
    if (prevData === undefined) delete process.env.BROS_DATA_DIR
    else process.env.BROS_DATA_DIR = prevData
    if (prevWork === undefined) delete process.env.BROS_WORKING_DIR
    else process.env.BROS_WORKING_DIR = prevWork
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('creates a bearer key that is not the passkey, and rotate replaces it', async () => {
    const auth = await import('../../src/server/utils/auth')
    auth.resetProxyKeyPrintForTests()
    auth.resetPasskeyPrintForTests()
    const passkey = auth.ensurePasskey()
    const key = auth.ensureProxyKey()
    expect(key).not.toBe(passkey)
    expect(auth.verifyProxyAuthorization(`Bearer ${key}`)).toBe(true)
    expect(auth.verifyProxyAuthorization(`Bearer ${passkey}`)).toBe(false)
    expect(auth.verifyProxyAuthorization('Bearer wrong')).toBe(false)
    const next = auth.rotateProxyKey()
    expect(next).not.toBe(key)
    expect(auth.verifyProxyKey(key)).toBe(false)
    expect(auth.verifyProxyKey(next)).toBe(true)
    expect(auth.ensureProxyKey()).toBe(next)
  })

  it('bearer opens docker api proxies and Bros /api for the host CLI', async () => {
    const auth = await import('../../src/server/utils/auth')
    auth.resetProxyKeyPrintForTests()
    const key = auth.ensureProxyKey()
    const api = { stripPrefix: true } as PublicProxyTarget
    const webui = { stripPrefix: false } as PublicProxyTarget
    expect(proxyRequestAuthorized({ authorization: `Bearer ${key}` }, api)).toBe(true)
    expect(proxyRequestAuthorized({ authorization: `Bearer ${key}` }, webui)).toBe(false)
    expect(matchPublicProxyTarget('/api/settings/passcode', [])).toBeNull()
    const middleware = readFileSync(new URL('../../src/server/middleware/01-auth.ts', import.meta.url), 'utf8')
    expect(middleware).toContain("path.startsWith('/api/') && verifyProxyAuthorization")
    const cliGate = middleware.indexOf("path.startsWith('/api/') && verifyProxyAuthorization")
    const apiProxyGate = middleware.indexOf('if (apiProxy)')
    expect(cliGate).toBeGreaterThan(-1)
    expect(apiProxyGate).toBeGreaterThan(cliGate)
  })

  it('builds an https origin from a bare public host', () => {
    expect(proxyPublicOrigin(null)).toBeNull()
    expect(proxyPublicOrigin('bros.example.com')).toBe('https://bros.example.com')
    expect(proxyPublicOrigin('https://bros.example.com/')).toBe('https://bros.example.com')
  })
})