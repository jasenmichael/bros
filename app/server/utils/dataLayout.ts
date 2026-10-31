import { accessSync, constants, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, statSync } from 'node:fs'
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
  ['apps-compose.yml', 'config/apps-compose.yml'],
  ['logs', 'var/logs'],
  ['tunnel', 'var/tunnel'],
] as const

/** Canonical bootstrap YAML: `$BROS_DIR/bros.yml`. */
export function brosYamlAtHome(appDir: string) {
  return join(appDir, 'bros.yml')
}

/** Legacy path under the data dir (pre home-root move). */
export function brosYamlInData(dataDir: string) {
  return join(dataDir, 'config', 'bros.yml')
}

/**
 * Move legacy `data/config/bros.yml` onto `$BROS_DIR/bros.yml`.
 * Drop a Docker-poison directory at the legacy path.
 */
export function migrateBrosYaml(dataDir: string, appDir: string) {
  const dest = brosYamlAtHome(appDir)
  const legacy = brosYamlInData(dataDir)
  if (existsSync(legacy)) {
    try {
      if (statSync(legacy).isDirectory()) {
        rmSync(legacy, { recursive: true, force: true })
      }
      else if (!existsSync(dest) || (statSync(dest).isDirectory() && readdirSync(dest).length === 0)) {
        if (existsSync(dest) && statSync(dest).isDirectory()) rmdirSync(dest)
        moveOnto(legacy, dest, 'config/bros.yml to bros.yml')
      }
    }
    catch (err) {
      noteSkip('bros.yml migrate', err)
    }
  }
  if (existsSync(dest) && statSync(dest).isDirectory()) {
    try {
      rmSync(dest, { recursive: true, force: true })
    }
    catch (err) {
      noteSkip('bros.yml dir poison', err)
    }
  }
}

export function migrateDataLayout(dataDir: string, appDir?: string) {
  mkdirSync(dataDir, { recursive: true })
  if (appDir) migrateBrosYaml(dataDir, appDir)
  for (const [from, to] of RENAMES) moveRel(dataDir, from, to)
}

export function configDir(dataDir: string) {
  return join(dataDir, 'config')
}
