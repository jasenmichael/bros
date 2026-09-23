import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'pathe'

/** Copy package `data/` into the sidecar volume. Skip paths that already exist. */
export function seedSidecarData(packageDir: string, volumeDir: string) {
  const seed = join(packageDir, 'data')
  if (!existsSync(seed)) return
  copyMissing(seed, volumeDir)
}

function copyMissing(src: string, dest: string) {
  const st = statSync(src)
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true })
    for (const name of readdirSync(src)) copyMissing(join(src, name), join(dest, name))
    return
  }
  if (!st.isFile() || existsSync(dest)) return
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest)
}

function isEmptyDir(path: string) {
  return statSync(path).isDirectory() && readdirSync(path).length === 0
}

function movePath(from: string, to: string) {
  if (!existsSync(from)) return
  if (existsSync(to)) {
    if (!isEmptyDir(to)) return
    rmSync(to, { recursive: true, force: true })
  }
  mkdirSync(dirname(to), { recursive: true })
  try {
    renameSync(from, to)
  } catch {
    cpSync(from, to, { recursive: true })
    rmSync(from, { recursive: true, force: true })
  }
}

/** Move a flat volume dir into a container-mirrored path inside itself. */
function nestVolume(dir: string, nestedRel: string) {
  if (!existsSync(dir)) return
  const dest = join(dir, nestedRel)
  if (existsSync(dest)) return
  const names = readdirSync(dir)
  const top = nestedRel.split(/[/\\]/)[0] || ''
  if (!names.length || (top && names.includes(top))) return
  const parent = dirname(dir)
  const base = dir.split(/[/\\]/).filter(Boolean).pop() || 'sidecar'
  let tmp = join(parent, `.migrate-${base}`)
  if (existsSync(tmp)) tmp = join(parent, `.migrate-${base}-${Date.now()}`)
  renameSync(dir, tmp)
  mkdirSync(dirname(dest), { recursive: true })
  movePath(tmp, dest)
}

function moveChildren(fromDir: string, toDir: string) {
  if (!existsSync(fromDir)) return
  mkdirSync(toDir, { recursive: true })
  for (const name of readdirSync(fromDir)) {
    movePath(join(fromDir, name), join(toDir, name))
  }
}

/**
 * One-time move from flat `$BROS_HOME/data/<bind>` dirs into `data/<id>/<container path>`,
 * and from `data/sidecars` + `data/sidecar-repos` into `sidecars/custom`.
 */
export function migrateSidecarDataLayout(dataDir: string, sidecarsRoot: string) {
  nestVolume(join(dataDir, 'ollama'), 'root/.ollama')
  movePath(join(dataDir, 'ollama-config'), join(dataDir, 'ollama/root/.config/ollama'))
  movePath(join(dataDir, 'bros-model'), join(dataDir, 'ollama/bros-model'))
  nestVolume(join(dataDir, 'opencode'), 'workspace')
  movePath(join(dataDir, 'opencode-config'), join(dataDir, 'opencode/root/.config/opencode'))
  movePath(join(dataDir, 'opencode-share'), join(dataDir, 'opencode/root/.local/share/opencode'))
  nestVolume(join(dataDir, 'openwebui'), 'app/backend/data')
  movePath(join(dataDir, 'firecrawl-redis'), join(dataDir, 'firecrawl/data'))
  movePath(join(dataDir, 'firecrawl-rabbitmq'), join(dataDir, 'firecrawl/var/lib/rabbitmq'))
  movePath(join(dataDir, 'firecrawl-pg'), join(dataDir, 'firecrawl/var/lib/postgresql/data'))
  nestVolume(join(dataDir, 'whisper'), 'home/ubuntu/.cache/huggingface/hub')
  const custom = join(sidecarsRoot, 'custom')
  moveChildren(join(dataDir, 'sidecars'), custom)
  moveChildren(join(dataDir, 'sidecar-repos'), custom)
}
