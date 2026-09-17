import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { defu } from 'defu'
import { join, resolve } from 'pathe'
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

/**
 * Load order:
 * 1. defaults (search roots + data)
 * 2. BROS_CONFIG exclusive file OR .config/bros.yml then ./bros.yml
 * 3. env overrides (BROS_WORKING_DIR, BROS_DATA_DIR, BROS_PUBLIC_URL)
 *
 * Nuxt often runs with cwd = src/app, so also search parent for bros.yml.
 */
export function loadBootstrapConfig(cwd = process.cwd()): BootstrapConfig {
  const searchRoots = Array.from(new Set([cwd, resolve(cwd, '..'), '/app']))

  let file: FileConfig = {}
  const exclusive = process.env.BROS_CONFIG?.trim()
  if (exclusive) {
    file = parseYamlFile(resolve(exclusive.startsWith('/') ? '/' : cwd, exclusive))
    if (!Object.keys(file).length) file = parseYamlFile(exclusive)
  } else {
    for (const root of searchRoots) {
      file = defu(
        parseYamlFile(join(root, 'bros.yml')),
        parseYamlFile(join(root, '.config/bros.yml')),
        file,
      )
    }
  }

  const envWorking = process.env.BROS_WORKING_DIR?.trim()
  const envData = process.env.BROS_DATA_DIR?.trim()
  const envPublic = process.env.BROS_PUBLIC_URL?.trim()

  const workingDir = resolveMaybe(
    cwd,
    envWorking || file.working_dir || (existsSync('/app') ? '/app' : cwd),
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

export function shouldAutostartFromPublicUrl(publicUrl: string | null | undefined): boolean {
  return Boolean(publicUrl && publicUrl.trim())
}

export function ensureDataLayout(dataDir: string) {
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(join(dataDir, 'sidecars'), { recursive: true })
  mkdirSync(join(dataDir, 'logs'), { recursive: true })
  mkdirSync(join(dataDir, 'tunnel'), { recursive: true })
}
