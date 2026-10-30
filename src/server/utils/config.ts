import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join, resolve } from 'pathe'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { brosYamlAtHome, configDir, migrateDataLayout } from './dataLayout.ts'
import { claimForHost } from './hostClaim.ts'
import { resolveWorkspaceHost } from './homePaths.ts'

export type BootstrapConfig = {
  /** App directory (`BROS_DIR`). */
  workingDir: string
  dataDir: string
  publicUrl: string | null
  enableHostOllama: boolean
  enableWhisper: boolean
  workspaceHost: string
}

type FileConfig = {
  public_url?: string
  enable_host_ollama?: boolean
  enable_whisper?: boolean
  workspace?: string
}

function appDirFromEnv(): string | null {
  const raw = (process.env.BROS_DIR || process.env.BROS_HOME || process.env.BROS_WORKING_DIR || '').trim()
  return raw || null
}

/** Walk up from Nuxt cwd (`src/ui`) to the checkout that owns compose or `bros.yml`. */
function findCheckoutRoot(start: string): string | null {
  let dir = resolve(start)
  for (let i = 0; i < 10; i++) {
    const hasYaml = existsSync(join(dir, 'bros.yml')) || existsSync(join(dir, 'data', 'config', 'bros.yml'))
    const hasCompose = existsSync(join(dir, 'lib/desktop/docker-compose.yml')) && existsSync(join(dir, 'lib/apps'))
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

function hostDataDir(dataDir: string): string {
  const explicit = process.env.BROS_HOST_DATA_DIR?.trim()
  if (explicit && explicit !== '/app/data' && explicit !== '/data') return resolve(explicit)
  return dataDir
}

export function dataDirFor(appDir: string): string {
  const envData = process.env.BROS_DATA_DIR?.trim()
  // `/data` is the old in-container marker. The bind is `$BROS_DIR/data` (`/app/data`).
  if (!envData || envData === '/data') return join(appDir, 'data')
  return resolve(envData)
}

export function brosYamlPath(appDir = resolveAppDir()): string {
  return brosYamlAtHome(appDir)
}

function parseYamlFile(path: string): FileConfig {
  if (!existsSync(path)) return {}
  try {
    if (!statSync(path).isFile()) return {}
  }
  catch {
    return {}
  }
  const raw = readFileSync(path, 'utf8')
  const data = parseYaml(raw) as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return {}
  const out: FileConfig = {}
  if (typeof data.public_url === 'string' && data.public_url.trim()) out.public_url = data.public_url.trim()
  if (typeof data.enable_host_ollama === 'boolean') out.enable_host_ollama = data.enable_host_ollama
  if (typeof data.enable_whisper === 'boolean') out.enable_whisper = data.enable_whisper
  if (typeof data.workspace === 'string' && data.workspace.trim()) out.workspace = data.workspace.trim()
  return out
}

/**
 * `$BROS_DIR/bros.yml` (install: `$BROS_HOME/bros.yml`). Data is `BROS_DATA_DIR` or `$BROS_DIR/data`.
 * `BROS_PUBLIC_URL` overrides YAML `public_url`.
 */
export function loadBootstrapConfig(cwd = process.cwd()): BootstrapConfig {
  const appDir = resolveAppDir(cwd)
  const dataDir = dataDirFor(appDir)
  migrateDataLayout(dataDir, appDir)
  const file = parseYamlFile(brosYamlPath(appDir))
  const envPublic = process.env.BROS_PUBLIC_URL?.trim()
  const publicUrl = envPublic || file.public_url || null
  return {
    workingDir: appDir,
    dataDir,
    publicUrl,
    enableHostOllama: file.enable_host_ollama === true,
    enableWhisper: file.enable_whisper === true,
    workspaceHost: resolveWorkspaceHost({
      dataDir: hostDataDir(dataDir),
      appDir: process.env.BROS_HOST_REPO?.trim() || appDir,
      yaml: file.workspace,
    }),
  }
}

export function patchBrosYaml(patch: Partial<FileConfig>, cwd = process.cwd()): FileConfig {
  const path = brosYamlPath(resolveAppDir(cwd))
  mkdirSync(join(path, '..'), { recursive: true })
  const current = existsSync(path)
    ? (parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown> | null) || {}
    : {}
  const next: Record<string, unknown> = { ...current }
  if (patch.public_url !== undefined) next.public_url = patch.public_url
  if (patch.enable_host_ollama !== undefined) next.enable_host_ollama = patch.enable_host_ollama
  if (patch.enable_whisper !== undefined) next.enable_whisper = patch.enable_whisper
  if (patch.workspace !== undefined) next.workspace = patch.workspace
  writeFileSync(path, stringifyYaml(next))
  claimForHost(path)
  return parseYamlFile(path)
}

/**
 * Host path for dockerApp Compose binds. In-container `/app/data` is not a bind source.
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
    throw new Error('BROS_HOST_DATA_DIR is unset; cannot bind docker app volumes')
  }
  return dataDir
}

function isContainerDataPath(path: string): boolean {
  const normalized = path.replace(/\/+$/, '')
  return normalized === '/app/data' || normalized.startsWith('/app/data/')
}

/**
 * Host path for Desktop `${BROS_HOST_WORKSPACE:?unset}`.
 * Env wins, then `bros.yml` `workspace`, then `$hostData/home/workspace`.
 * Never the in-container `/app/data` tree unless that path is the host data dir.
 */
export function hostWorkspaceForCompose(): string {
  const env = process.env.BROS_HOST_WORKSPACE?.trim()
  if (env) return resolve(env)
  const hostDefault = join(hostDataDirForBinds(), 'home', 'workspace')
  const configured = loadBootstrapConfig().workspaceHost.trim()
  if (!configured || isContainerDataPath(configured)) return hostDefault
  return configured
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
    if (existing) {
      claimForHost(path)
      return existing
    }
  }
  const secret = randomBytes(32).toString('hex')
  writeFileSync(path, `${secret}\n`, { mode: 0o600 })
  claimForHost(path)
  return secret
}

export function ensureDataLayout(dataDir: string) {
  migrateDataLayout(dataDir)
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(configDir(dataDir), { recursive: true })
  mkdirSync(join(dataDir, 'config', 'skills'), { recursive: true })
  mkdirSync(join(dataDir, 'config', 'apps'), { recursive: true })
  mkdirSync(join(dataDir, 'home', '.local', 'app-bins'), { recursive: true })
  mkdirSync(join(dataDir, 'home', 'workspace'), { recursive: true })
  mkdirSync(join(dataDir, 'home', '.agents', 'skills'), { recursive: true })
  mkdirSync(join(dataDir, 'var', 'logs'), { recursive: true })
  mkdirSync(join(dataDir, 'var', 'tunnel'), { recursive: true })
  ensureSessionSecret(dataDir)
}
