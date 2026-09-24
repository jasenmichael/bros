import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
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
