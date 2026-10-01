import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'pathe'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export type BootstrapConfig = {
  /** App directory (`BROS_DIR`). */
  workingDir: string
  dataDir: string
  publicUrl: string | null
  enableHostOllama: boolean
  enableWhisper: boolean
}

type FileConfig = {
  public_url?: string
  enable_host_ollama?: boolean
  enable_whisper?: boolean
}

function appDirFromEnv(): string | null {
  const raw = (process.env.BROS_DIR || process.env.BROS_HOME || process.env.BROS_WORKING_DIR || '').trim()
  return raw || null
}

/** Walk up from Nuxt cwd (`src/app`) to the checkout that owns `bros.yml`. */
function findCheckoutRoot(start: string): string | null {
  let dir = resolve(start)
  for (let i = 0; i < 10; i++) {
    const hasYaml = existsSync(join(dir, 'bros.yml'))
    const hasCompose = existsSync(join(dir, 'docker-compose.yml')) && existsSync(join(dir, 'lib/sidecars'))
    if (hasYaml || hasCompose) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function resolveAppDir(cwd = process.cwd()): string {
  const fromEnv = appDirFromEnv()
  if (fromEnv) return resolve(fromEnv)
  return findCheckoutRoot(cwd) || resolve(cwd)
}

export function brosYamlPath(appDir = resolveAppDir()): string {
  return join(appDir, 'bros.yml')
}

function parseYamlFile(path: string): FileConfig {
  if (!existsSync(path)) return {}
  const raw = readFileSync(path, 'utf8')
  const data = parseYaml(raw) as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return {}
  const out: FileConfig = {}
  if (typeof data.public_url === 'string' && data.public_url.trim()) out.public_url = data.public_url.trim()
  if (typeof data.enable_host_ollama === 'boolean') out.enable_host_ollama = data.enable_host_ollama
  if (typeof data.enable_whisper === 'boolean') out.enable_whisper = data.enable_whisper
  return out
}

/**
 * `$BROS_DIR/bros.yml` only. Data is `BROS_DATA_DIR` or `$BROS_DIR/data`.
 * `BROS_PUBLIC_URL` overrides YAML `public_url`.
 */
export function loadBootstrapConfig(cwd = process.cwd()): BootstrapConfig {
  const appDir = resolveAppDir(cwd)
  const file = parseYamlFile(brosYamlPath(appDir))
  const envData = process.env.BROS_DATA_DIR?.trim()
  const dataDir = envData ? resolve(envData) : join(appDir, 'data')
  const envPublic = process.env.BROS_PUBLIC_URL?.trim()
  const publicUrl = envPublic || file.public_url || null
  return {
    workingDir: appDir,
    dataDir,
    publicUrl,
    enableHostOllama: file.enable_host_ollama === true,
    enableWhisper: file.enable_whisper === true,
  }
}

export function patchBrosYaml(patch: Partial<FileConfig>, cwd = process.cwd()): FileConfig {
  const path = brosYamlPath(resolveAppDir(cwd))
  const current = existsSync(path)
    ? (parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown> | null) || {}
    : {}
  const next: Record<string, unknown> = { ...current }
  if (patch.public_url !== undefined) next.public_url = patch.public_url
  if (patch.enable_host_ollama !== undefined) next.enable_host_ollama = patch.enable_host_ollama
  if (patch.enable_whisper !== undefined) next.enable_whisper = patch.enable_whisper
  writeFileSync(path, stringifyYaml(next))
  return parseYamlFile(path)
}

/**
 * Host path for sidecar Compose binds. In-container `/app/data` is not a bind source.
 */
export function hostDataDirForBinds(): string {
  const explicit = process.env.BROS_HOST_DATA_DIR?.trim()
  if (explicit && explicit !== '/app/data' && explicit !== '/data') return resolve(explicit)
  const dataOverride = process.env.BROS_DATA_DIR?.trim()
  if (dataOverride && dataOverride !== '/app/data' && dataOverride !== '/data') return resolve(dataOverride)
  const home = (process.env.BROS_DIR || process.env.BROS_HOME || '').trim()
  if (home && home !== '/app') return resolve(home, 'data')
  const { dataDir, workingDir } = loadBootstrapConfig()
  if (workingDir === '/app' || dataDir === '/app/data' || dataDir === '/data') {
    throw new Error('BROS_HOST_DATA_DIR is unset; cannot bind sidecar volumes')
  }
  return dataDir
}

export function shouldAutostartFromPublicUrl(publicUrl: string | null | undefined): boolean {
  return Boolean(publicUrl && publicUrl.trim())
}

export function sessionSecretPath(dataDir = loadBootstrapConfig().dataDir): string {
  return join(dataDir, 'session-secret')
}

export function ensureSessionSecret(dataDir = loadBootstrapConfig().dataDir): string {
  const path = sessionSecretPath(dataDir)
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8').trim()
    if (existing) return existing
  }
  const secret = randomBytes(32).toString('hex')
  writeFileSync(path, `${secret}\n`, { mode: 0o600 })
  return secret
}

export function ensureDataLayout(dataDir: string) {
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(join(dataDir, 'logs'), { recursive: true })
  mkdirSync(join(dataDir, 'tunnel'), { recursive: true })
  ensureSessionSecret(dataDir)
}
