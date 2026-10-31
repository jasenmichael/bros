import { mkdirSync } from 'node:fs'
import { join, resolve } from 'pathe'

/** Relative home path. No absolute path, no `.` or `..`. */
export function validHomePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false
  const parts = path.split('/')
  return parts.every((part) => !!part && part !== '.' && part !== '..')
}

export function parseHomePaths(raw: unknown): string[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) throw new Error('home must be a list')
  const out: string[] = []
  for (const row of raw) {
    const path = String(row).trim()
    if (!path) continue
    if (!validHomePath(path)) throw new Error(`home path is invalid: ${path}`)
    if (!out.includes(path)) out.push(path)
  }
  return out
}

export function duplicateHomePath(rows: { id: string; home?: string[] }[]): string | null {
  const seen = new Map<string, string>()
  for (const row of rows) {
    for (const path of row.home || []) {
      const prev = seen.get(path)
      if (prev && prev !== row.id) return path
      seen.set(path, row.id)
    }
  }
  return null
}

export function ensureHomeDirs(dataDir: string, paths: string[]) {
  for (const path of paths) {
    if (!validHomePath(path)) throw new Error(`home path is invalid: ${path}`)
    mkdirSync(join(dataDir, 'home', path), { recursive: true })
  }
}

/** `BROS_WORKSPACE` wins, then `bros.yml` `workspace`, then `data/home/workspace`. */
export function resolveWorkspaceHost(input: { dataDir: string; appDir: string; yaml?: string }): string {
  const env = process.env.BROS_WORKSPACE?.trim()
  if (env) return resolve(env)
  const yaml = input.yaml?.trim()
  if (yaml) return resolve(yaml.startsWith('/') ? yaml : join(input.appDir, yaml))
  return join(input.dataDir, 'home', 'workspace')
}
