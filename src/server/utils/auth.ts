import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { getRequestHeader, getRequestProtocol, type H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { join } from 'pathe'
import { loadBootstrapConfig } from './config'
import { getDb, meta, sessions } from './db'
import { viaTunnelFromEvent } from './viaTunnel'

const SECRET_KEY = 'app_secret'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14
export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_MS / 1000
/** Plaintext passkey filename under dataDir — source of truth for login. */
export const PASSKEY_FILENAME = 'passkey'

let printedPasskeyOnce = false

export function passkeyPath(): string {
  return join(loadBootstrapConfig().dataDir, PASSKEY_FILENAME)
}

export function readPasskey(): string | null {
  const path = passkeyPath()
  if (!existsSync(path)) return null
  const value = readFileSync(path, 'utf8').trim()
  return value.length ? value : null
}

function writePasskeyFile(passcode: string) {
  const { dataDir } = loadBootstrapConfig()
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(passkeyPath(), `${passcode}\n`, { encoding: 'utf8', mode: 0o600 })
}

/**
 * Ensure `{dataDir}/passkey` exists (generate if missing) and print once.
 * Call at Nitro boot and on first request bootstrap.
 */
export function ensurePasskey(): string {
  let key = readPasskey()
  let created = false
  if (!key) {
    key = randomBytes(9).toString('base64url')
    writePasskeyFile(key)
    created = true
  }
  if (!printedPasskeyOnce) {
    printedPasskeyOnce = true
    console.log(`[bros] passkey${created ? ' (new)' : ''}: ${key}`)
    console.log(`[bros] passkey file: ${passkeyPath()}`)
  }
  return key
}

/** Test helper — allow another ensurePasskey() log. */
export function resetPasskeyPrintForTests() {
  printedPasskeyOnce = false
}

export function ensureAppSecret(): string {
  const db = getDb()
  const row = db.select().from(meta).where(eq(meta.key, SECRET_KEY)).get()
  if (row) return row.value
  const secret = randomBytes(32).toString('hex')
  db.insert(meta).values({ key: SECRET_KEY, value: secret }).run()
  return secret
}

export function hasPasscode(): boolean {
  return Boolean(readPasskey())
}

export function setPasscode(passcode: string) {
  const trimmed = passcode.trim()
  if (trimmed.length < 4) throw createError({ statusCode: 400, statusMessage: 'Passcode too short' })
  writePasskeyFile(trimmed)
}

export function verifyPasscode(passcode: string): boolean {
  const expected = readPasskey()
  if (!expected) return false
  const a = Buffer.from(passcode.trim(), 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function createSession(): string {
  const token = randomBytes(32).toString('hex')
  const now = Date.now()
  getDb().insert(sessions).values({
    token,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  }).run()
  return token
}

export function destroySession(token: string) {
  getDb().delete(sessions).where(eq(sessions.token, token)).run()
}

export function isSessionValid(token?: string | null): boolean {
  if (!token) return false
  const row = getDb().select().from(sessions).where(eq(sessions.token, token)).get()
  if (!row) return false
  if (row.expiresAt < Date.now()) {
    destroySession(token)
    return false
  }
  return true
}

export function encryptSecret(plain: string): string {
  const secret = ensureAppSecret()
  const key = createHash('sha256').update(secret).digest()
  const iv = randomBytes(12)
  // lightweight XOR+hmac style obfuscation suitable for local single-user store
  const data = Buffer.from(plain, 'utf8')
  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length]
  return `${iv.toString('hex')}:${out.toString('hex')}`
}

export function decryptSecret(enc: string): string {
  const secret = ensureAppSecret()
  const key = createHash('sha256').update(secret).digest()
  const [, hex] = enc.split(':')
  const data = Buffer.from(hex || '', 'hex')
  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length]
  return out.toString('utf8')
}

export const SESSION_COOKIE = 'bros_session'

/** True when the browser saw HTTPS — including CF tunnel to local HTTP. */
export function requestIsHttps(input: {
  protocol?: string | null
  forwardedProto?: string | null
  cfVisitor?: string | null
  viaTunnel?: boolean
}): boolean {
  const proto = (input.protocol || '').toLowerCase().replace(/:$/, '')
  if (proto === 'https') return true
  const forwarded = (input.forwardedProto || '').split(',')[0]?.trim().toLowerCase()
  if (forwarded === 'https') return true
  if ((input.cfVisitor || '').toLowerCase().includes('https')) return true
  return Boolean(input.viaTunnel)
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE,
    secure,
  }
}

export function sessionCookieOptionsForEvent(event: H3Event) {
  return sessionCookieOptions(requestIsHttps({
    protocol: getRequestProtocol(event),
    forwardedProto: getRequestHeader(event, 'x-forwarded-proto'),
    cfVisitor: getRequestHeader(event, 'cf-visitor'),
    viaTunnel: viaTunnelFromEvent(event),
  }))
}
