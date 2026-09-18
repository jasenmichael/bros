import { createError } from 'h3'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'pathe'
import { loadBootstrapConfig } from './config'
import { OLLAMA_SIDECAR_DNS } from './ollamaHost'

export const INTERNAL_BROS_MODEL = 'bros'
export const VENDOR_BROS_MODEL_REL = 'vendor/bros-model'
export const GGUF_REL = 'models/bros-q4_k_m.gguf'
export const STAMP_NAME = '.bros-gguf-stamp.json'
export const COPY_PARTS = ['models', 'ollama', 'scripts'] as const
const CREATE_TIMEOUT_MS = 180_000

type GgufStamp = { size: number; mtimeMs: number }

let inflight: Promise<void> | null = null
let loggedMissingGguf = false

export function isInternalBrosModel(name: string): boolean {
  const n = name.trim()
  if (!n) return false
  const bare = n.endsWith(':latest') ? n.slice(0, -':latest'.length) : n
  return bare === INTERNAL_BROS_MODEL
}

export function refuseInternalBrosModel(name: string) {
  if (!isInternalBrosModel(name)) return
  throw createError({
    statusCode: 400,
    statusMessage: `Reserved internal model: ${INTERNAL_BROS_MODEL}`,
  })
}

export function resetInternalBrosModelForTests() {
  inflight = null
  loggedMissingGguf = false
}

export function vendorBrosModelDir(workingDir: string) {
  return join(workingDir, VENDOR_BROS_MODEL_REL)
}

export function vendorGgufPath(workingDir: string) {
  return join(vendorBrosModelDir(workingDir), GGUF_REL)
}

export function destBrosModelDir(dataDir: string) {
  return join(dataDir, 'bros-model')
}

function readStamp(destDir: string): GgufStamp | null {
  const path = join(destDir, STAMP_NAME)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<GgufStamp>
    if (typeof raw.size === 'number' && typeof raw.mtimeMs === 'number') {
      return { size: raw.size, mtimeMs: raw.mtimeMs }
    }
  }
  catch {
    // ignore bad stamp
  }
  return null
}

function writeStamp(destDir: string, stamp: GgufStamp) {
  mkdirSync(destDir, { recursive: true })
  writeFileSync(join(destDir, STAMP_NAME), JSON.stringify(stamp), 'utf8')
}

function vendorStamp(ggufPath: string): GgufStamp {
  const st = statSync(ggufPath)
  return { size: st.size, mtimeMs: st.mtimeMs }
}

function stampMatches(a: GgufStamp | null, b: GgufStamp): boolean {
  return Boolean(a) && a!.size === b.size && a!.mtimeMs === b.mtimeMs
}

function copyVendorTree(vendorRoot: string, destRoot: string) {
  mkdirSync(destRoot, { recursive: true })
  for (const part of COPY_PARTS) {
    const from = join(vendorRoot, part)
    if (!existsSync(from)) continue
    cpSync(from, join(destRoot, part), { recursive: true })
  }
}

async function sidecarHasBros(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_SIDECAR_DNS.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return false
    const data = await res.json() as { models?: Array<{ name?: string }> }
    return (data.models || []).some((m) => isInternalBrosModel(String(m.name || '')))
  }
  catch {
    return false
  }
}

async function ensureInternalBrosModelOnce() {
  const { workingDir, dataDir } = loadBootstrapConfig()
  const gguf = vendorGgufPath(workingDir)
  if (!existsSync(gguf)) {
    if (!loggedMissingGguf) {
      loggedMissingGguf = true
      console.error(`internal bros model: missing packaged model: ${gguf}`)
    }
    return
  }

  const destDir = destBrosModelDir(dataDir)
  const identity = vendorStamp(gguf)
  const hasBros = await sidecarHasBros()
  if (hasBros && stampMatches(readStamp(destDir), identity)) return

  copyVendorTree(vendorBrosModelDir(workingDir), destDir)

  const { execInSidecar } = await import('./docker')
  const res = await execInSidecar(
    'ollama',
    ['bash', '/bros-model/scripts/install-ollama.sh'],
    CREATE_TIMEOUT_MS,
  )
  if (res.code !== 0) {
    console.error('internal bros model create failed', res.stderr || res.stdout)
    return
  }
  writeStamp(destDir, identity)
}

/** Sidecar running only. Missing GGUF / create fail: log, do not throw. */
export async function ensureInternalBrosModel() {
  if (inflight) return inflight
  inflight = ensureInternalBrosModelOnce()
    .catch((err) => {
      console.error('internal bros model ensure failed', err)
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}
