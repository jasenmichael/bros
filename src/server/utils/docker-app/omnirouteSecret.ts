import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadBootstrapConfig } from '../config'

/** `$BROS_HOST_DATA_DIR/apps/omniroute/.env` — not the pack directory. */
export function omnirouteEnvPath(dataDir = loadBootstrapConfig().dataDir): string {
  return join(dataDir, 'apps', 'omniroute', '.env')
}

export function parseOmnirouteJwtSecret(text: string): string {
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*OMNIROUTE_JWT_SECRET\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[1].trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    return value.trim()
  }
  return ''
}

/**
 * Ensure OmniRoute JWT lives under data (mode 0600), not a root-only pack `.env`.
 * Compose cwd is the pack; an unreadable pack `.env` is EACCES for user bros.
 */
export function ensureOmnirouteJwtSecret(opts?: {
  dataDir?: string
  packDir?: string
  env?: NodeJS.ProcessEnv
}): string {
  const env = opts?.env || process.env
  const dataDir = opts?.dataDir || loadBootstrapConfig().dataDir
  const dir = join(dataDir, 'apps', 'omniroute')
  const path = omnirouteEnvPath(dataDir)
  mkdirSync(dir, { recursive: true })

  let secret = env.OMNIROUTE_JWT_SECRET?.trim() || ''
  if (!secret && existsSync(path)) {
    try {
      secret = parseOmnirouteJwtSecret(readFileSync(path, 'utf8'))
    } catch {
      // data file unreadable — generate below
    }
  }

  const packEnv = opts?.packDir ? join(opts.packDir, '.env') : ''
  if (!secret && packEnv && existsSync(packEnv)) {
    try {
      secret = parseOmnirouteJwtSecret(readFileSync(packEnv, 'utf8'))
    } catch {
      // root-only pack .env — cont-init removes it
    }
  }

  if (!secret) secret = randomBytes(32).toString('hex')

  writeFileSync(path, `OMNIROUTE_JWT_SECRET=${secret}\n`, { mode: 0o600 })

  if (packEnv && existsSync(packEnv)) {
    try {
      unlinkSync(packEnv)
    } catch {
      // image root file needs cont-init as root
    }
  }

  return secret
}
