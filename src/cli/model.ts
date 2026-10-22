import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const GGUF_REL = 'models/bros-q4_k_m.gguf'
export const STAMP_NAME = '.bros-gguf-stamp.json'

export interface Stamp {
  size: number
  mtimeMs: number
}

export function stampOf(file: string): Stamp {
  const s = statSync(file)
  return { size: s.size, mtimeMs: s.mtimeMs }
}

export function readStamp(file: string): Stamp | null {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Stamp>
    if (typeof raw.size !== 'number' || typeof raw.mtimeMs !== 'number') return null
    return { size: raw.size, mtimeMs: raw.mtimeMs }
  }
  catch {
    return null
  }
}

export function stampMatches(vendor: Stamp, saved: Stamp | null): boolean {
  return saved !== null && saved.size === vendor.size && saved.mtimeMs === vendor.mtimeMs
}

export function vendorModelDir(): string {
  const repo = process.env.BROS_HOST_REPO
  if (repo && existsSync(join(repo, 'vendor/bros-model', GGUF_REL))) {
    return join(repo, 'vendor/bros-model')
  }
  return '/app/vendor/bros-model'
}

export function dataModelDir(): string {
  return '/app/data/sidecars/ollama/bros-model'
}

export function copyVendorModel(vendorDir: string, destDir: string) {
  mkdirSync(destDir, { recursive: true })
  for (const part of ['models', 'ollama', 'scripts']) {
    const from = join(vendorDir, part)
    if (!existsSync(from)) continue
    const to = join(destDir, part)
    rmSync(to, { recursive: true, force: true })
    cpSync(from, to, { recursive: true })
  }
}

export function writeStampFile(destDir: string, stamp: Stamp) {
  mkdirSync(destDir, { recursive: true })
  writeFileSync(join(destDir, STAMP_NAME), `${JSON.stringify(stamp)}\n`)
}
