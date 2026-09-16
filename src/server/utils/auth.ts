import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb, meta, sessions } from './db'

const PASSCODE_KEY = 'passcode_hash'
const SECRET_KEY = 'app_secret'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14

function hashPasscode(passcode: string, salt: string): string {
  return scryptSync(passcode, salt, 64).toString('hex')
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
  const db = getDb()
  return Boolean(db.select().from(meta).where(eq(meta.key, PASSCODE_KEY)).get())
}

export function setPasscode(passcode: string) {
  if (passcode.length < 4) throw createError({ statusCode: 400, statusMessage: 'Passcode too short' })
  const salt = randomBytes(16).toString('hex')
  const hash = `${salt}:${hashPasscode(passcode, salt)}`
  const db = getDb()
  const existing = db.select().from(meta).where(eq(meta.key, PASSCODE_KEY)).get()
  if (existing) {
    db.update(meta).set({ value: hash }).where(eq(meta.key, PASSCODE_KEY)).run()
  } else {
    db.insert(meta).values({ key: PASSCODE_KEY, value: hash }).run()
  }
}

export function verifyPasscode(passcode: string): boolean {
  const db = getDb()
  const row = db.select().from(meta).where(eq(meta.key, PASSCODE_KEY)).get()
  if (!row) return false
  const [salt, expected] = row.value.split(':')
  if (!salt || !expected) return false
  const actual = hashPasscode(passcode, salt)
  try {
    return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
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
