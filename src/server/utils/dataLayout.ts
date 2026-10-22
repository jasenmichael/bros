import { accessSync, constants, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync } from 'node:fs'
import { join } from 'pathe'

const skipped = new Set<string>()

function noteSkip(label: string, err: unknown) {
  if (skipped.has(label)) return
  skipped.add(label)
  console.error(`data layout: could not move ${label}`, err)
}

/** True when dest is a real file or a non-empty directory. An empty directory is removed so a later rename can land. */
function destBlocks(path: string) {
  if (!existsSync(path)) return false
  try {
    if (statSync(path).isDirectory() && readdirSync(path).length === 0) {
      rmdirSync(path)
      return false
    }
  }
  catch {
    return true
  }
  return true
}

/** Move once. Leave both when dest has content. Skip a dir we cannot write. A cross-device file is copied. */
function moveOnto(src: string, dest: string, label: string) {
  if (!existsSync(src)) return
  try {
    if (statSync(src).isDirectory()) accessSync(src, constants.W_OK)
  }
  catch (err) {
    noteSkip(label, err)
    return
  }
  mkdirSync(join(dest, '..'), { recursive: true })
  if (destBlocks(dest)) return
  try {
    renameSync(src, dest)
  }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EXDEV' && statSync(src).isFile()) {
      try {
        copyFileSync(src, dest)
        return
      }
      catch (copyErr) {
        noteSkip(label, copyErr)
        return
      }
    }
    noteSkip(label, err)
  }
}

function moveRel(root: string, from: string, to: string) {
  moveOnto(join(root, from), join(root, to), `${from} to ${to}`)
}

const RENAMES = [
  ['skills', 'config/skills'],
  ['rules/assistant.md', 'config/assistant.md'],
  ['apps', 'config/apps'],
  ['apps-compose.yml', 'config/apps-compose.yml'],
  ['logs', 'var/logs'],
  ['tunnel', 'var/tunnel'],
] as const

export function migrateDataLayout(dataDir: string, appDir?: string) {
  mkdirSync(dataDir, { recursive: true })
  if (appDir) {
    const dest = join(dataDir, 'config', 'bros.yml')
    const src = join(appDir, 'bros.yml')
    if (existsSync(src) && !existsSync(dest)) {
      mkdirSync(join(dataDir, 'config'), { recursive: true })
      moveOnto(src, dest, 'bros.yml')
    }
  }
  for (const [from, to] of RENAMES) moveRel(dataDir, from, to)
}

export function configDir(dataDir: string) {
  return join(dataDir, 'config')
}

export function brosYamlInData(dataDir: string) {
  return join(dataDir, 'config', 'bros.yml')
}
