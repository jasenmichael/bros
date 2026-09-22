import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { defu } from 'defu'
import { dirname, join, resolve } from 'pathe'
import { parse as parseYaml } from 'yaml'

export type BootstrapConfig = {
  workingDir: string
  dataDir: string
  publicUrl: string | null
}

type FileConfig = {
  working_dir?: string
  data_dir?: string
  public_url?: string
}

function parseYamlFile(path: string): FileConfig {
  if (!existsSync(path)) return {}
  const raw = readFileSync(path, 'utf8')
  const data = parseYaml(raw) as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return {}
  const out: FileConfig = {}
  if (typeof data.working_dir === 'string' && data.working_dir.trim()) out.working_dir = data.working_dir
  if (typeof data.data_dir === 'string' && data.data_dir.trim()) out.data_dir = data.data_dir
  if (typeof data.public_url === 'string' && data.public_url.trim()) out.public_url = data.public_url.trim()
  return out
}

function resolveMaybe(base: string, value: string): string {
  if (value.startsWith('~/')) return resolve(homedir(), value.slice(2))
  if (value.startsWith('/')) return value
  return resolve(base, value)
}

/** Walk up from Nuxt cwd (`src/app`) to the checkout that owns `bros.yml`. */
function findCheckoutRoot(start: string): string | null {
  let dir = resolve(start)
  for (let i = 0; i < 10; i++) {
    const hasYaml = existsSync(join(dir, 'bros.yml')) || existsSync(join(dir, '.config/bros.yml'))
    const hasCompose = existsSync(join(dir, 'docker-compose.yml')) && existsSync(join(dir, 'sidecars'))
    if (hasYaml || hasCompose) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Load order:
 * 1. defaults (search roots + data)
 * 2. BROS_CONFIG exclusive file OR .config/bros.yml then ./bros.yml
 * 3. env overrides (BROS_WORKING_DIR, BROS_DATA_DIR, BROS_PUBLIC_URL)
 *
 * Nuxt often runs with cwd = src/app. Walk up to the checkout `bros.yml` and
 * resolve relative working_dir / data_dir against that file's directory.
 */
export function loadBootstrapConfig(cwd = process.cwd()): BootstrapConfig {
  const checkout = findCheckoutRoot(cwd)
  const searchRoots = Array.from(new Set(
    [cwd, resolve(cwd, '..'), checkout, '/app'].filter((root): root is string => Boolean(root)),
  ))

  let file: FileConfig = {}
  let pathBase = checkout || cwd
  const exclusive = process.env.BROS_CONFIG?.trim()
  if (exclusive) {
    const abs = exclusive.startsWith('/') ? exclusive : resolve(cwd, exclusive)
    file = parseYamlFile(abs)
    if (!Object.keys(file).length) file = parseYamlFile(exclusive)
    else pathBase = dirname(abs)
  } else {
    for (const root of searchRoots) {
      const fromCheckout = parseYamlFile(join(root, 'bros.yml'))
      const fromNested = parseYamlFile(join(root, '.config/bros.yml'))
      if (Object.keys(fromCheckout).length || Object.keys(fromNested).length) {
        pathBase = root
      }
      file = defu(fromCheckout, fromNested, file)
    }
  }

  const envWorking = process.env.BROS_WORKING_DIR?.trim()
  const envData = process.env.BROS_DATA_DIR?.trim()
  const envPublic = process.env.BROS_PUBLIC_URL?.trim()

  const workingDir = resolveMaybe(
    pathBase,
    envWorking || file.working_dir || (existsSync('/app') ? '/app' : pathBase),
  )
  const dataDir = resolveMaybe(
    workingDir,
    envData || file.data_dir || join(workingDir, 'data'),
  )

  if (!dataDir) {
    throw new Error('Bros dataDir unresolved')
  }

  const publicUrl = envPublic || file.public_url || null

  return { workingDir, dataDir, publicUrl }
}

/**
 * Host path for sidecar Compose binds. In-container `BROS_DATA_DIR=/data` is not
 * a bind source. Empty `BROS_HOST_DATA_DIR` interpolates to `/ollama` on the host.
 */
export function hostDataDirForBinds(): string {
  const explicit = process.env.BROS_HOST_DATA_DIR?.trim()
  if (explicit && explicit !== '/data') return resolve(explicit)
  const home = (process.env.BROS_HOME || process.env.BROS_DIR || '').trim()
  if (home) return resolve(home, 'data')
  const { dataDir } = loadBootstrapConfig()
  if (dataDir === '/data' || dataDir === '/data/') {
    throw new Error('BROS_HOST_DATA_DIR is unset; cannot bind sidecar volumes')
  }
  return dataDir
}

export function shouldAutostartFromPublicUrl(publicUrl: string | null | undefined): boolean {
  return Boolean(publicUrl && publicUrl.trim())
}

export function ensureDataLayout(dataDir: string) {
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(join(dataDir, 'sidecars'), { recursive: true })
  mkdirSync(join(dataDir, 'sidecar-repos'), { recursive: true })
  mkdirSync(join(dataDir, 'logs'), { recursive: true })
  mkdirSync(join(dataDir, 'tunnel'), { recursive: true })
}
