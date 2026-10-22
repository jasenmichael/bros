import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { during } from './progress.mjs'

const STAMP_DIR = '/var/lib/bros/deb'
const ID_SPEC = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const PKG_SPEC = /^[a-z0-9][a-z0-9.+-]{0,62}$/

export function debTracksLatest(spec) {
  try {
    return new URL(spec).pathname.split('/').includes('latest')
  } catch {
    return false
  }
}

// shortcut: compare the resolved URL, read the deb Version if a host rotates that URL without a new path
export function releaseKey(chain) {
  const keys = []
  for (const raw of chain) {
    try {
      const url = new URL(raw, keys[keys.length - 1] || undefined)
      url.search = ''
      url.hash = ''
      keys.push(url.toString())
    } catch {
      // skip a bad redirect
    }
  }
  for (let i = keys.length - 1; i >= 0; i -= 1) {
    const host = new URL(keys[i]).hostname
    if (host === 'github.com' || !host.endsWith('githubusercontent.com')) return keys[i]
  }
  return keys[keys.length - 1] || ''
}

function q(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function stampFile(id) {
  return `${STAMP_DIR}/${id}`
}

function readStamp(id) {
  if (!ID_SPEC.test(id)) return null
  try {
    const [name, key] = readFileSync(stampFile(id), 'utf8').split('\n')
    return { name: (name || '').trim(), key: (key || '').trim() }
  } catch {
    return null
  }
}

function curl(args) {
  return spawnSync('curl', ['-A', 'Mozilla/5.0', ...args], { encoding: 'utf8' })
}

function locationsFrom(text) {
  const locations = []
  for (const line of String(text || '').split('\n')) {
    const match = line.match(/^location:\s*(\S+)/i)
    if (match) locations.push(match[1])
  }
  return locations
}

function resolveKey(spec) {
  const res = curl(['-sSIL', '--max-redirs', '10', spec])
  return releaseKey([spec, ...locationsFrom(res.stdout)])
}

export function debCachePath(id, key) {
  const safe = String(key).replace(/[^A-Za-z0-9._-]+/g, '_').slice(-180)
  return join('/var/cache/bros/debs', id, `${safe}.deb`)
}

function cacheFile(id, key) {
  const cached = debCachePath(id, key)
  try {
    mkdirSync(dirname(cached), { recursive: true })
    return { file: cached, keep: true }
  } catch {
    return { file: `/tmp/bros-${id}.deb`, keep: false }
  }
}

function downloadDeb(spec, id) {
  let key = resolveKey(spec) || spec
  let { file, keep } = cacheFile(id, key)
  let headers = ''
  if (!existsSync(file)) {
    const downloaded = curl(['-fsSL', '-D', '-', '-o', file, spec])
    headers = downloaded.stdout || ''
    if (downloaded.status !== 0) {
      rmSync(file, { force: true })
      return null
    }
    const resolved = releaseKey([spec, ...locationsFrom(headers)])
    if (keep && resolved && resolved !== key) {
      const moved = cacheFile(id, resolved)
      renameSync(file, moved.file)
      file = moved.file
      key = resolved
    }
  }
  const info = spawnSync('dpkg-deb', ['-f', file, 'Package'], { encoding: 'utf8' })
  const name = (info.stdout || '').trim()
  if (info.status !== 0 || !PKG_SPEC.test(name)) {
    if (!keep) rmSync(file, { force: true })
    return null
  }
  return { file, keep, key, headers, name }
}

function finishDeb(spec, id, loaded) {
  const { file, keep, key, headers, name } = loaded
  const installed = spawnSync('bash', ['-lc', `DEBIAN_FRONTEND=noninteractive apt-get install -y ${q(file)}`], { stdio: 'inherit' })
  if (installed.status !== 0) {
    if (!keep) rmSync(file, { force: true })
    return false
  }
  mkdirSync(STAMP_DIR, { recursive: true })
  const saved = headers ? releaseKey([spec, ...locationsFrom(headers)]) : key
  writeFileSync(stampFile(id), `${name}\n${saved}\n`)
  if (!keep) rmSync(file, { force: true })
  return true
}

export function installDeb(spec, id) {
  if (!ID_SPEC.test(id)) return false
  const loaded = during(`${id}: download`, () => downloadDeb(spec, id))
  if (!loaded) return false
  return during(`${id}: install`, () => finishDeb(spec, id, loaded))
}

export function checkDeb(spec, id) {
  if (!debTracksLatest(spec)) return false
  const stamp = readStamp(id)
  if (!stamp?.key) return false
  const key = resolveKey(spec)
  return !!key && key !== stamp.key
}

export const deb = {
  kind: 'deb',
  apply(pkg, ctx) {
    if (!ctx.aptUpdated) {
      if (!during(`${pkg.id}: apt update`, () => ctx.sh('apt-get update'))) return false
      ctx.aptUpdated = true
    }
    return installDeb(pkg.spec, pkg.id)
  },
  remove(pkg, ctx) {
    const name = readStamp(pkg.id)?.name
    if (name && PKG_SPEC.test(name)) ctx.sh(`DEBIAN_FRONTEND=noninteractive apt-get remove -y ${ctx.q(name)}`)
    if (ID_SPEC.test(pkg.id)) rmSync(stampFile(pkg.id), { force: true })
  },
  present(pkg, ctx) {
    const name = readStamp(pkg.id)?.name
    if (!name || !PKG_SPEC.test(name)) return false
    return ctx.dpkg(name)
  },
}

function main() {
  const [cmd, id, spec] = process.argv.slice(2)
  if (cmd === 'install') {
    if (!during(`${id}: apt update`, () => spawnSync('bash', ['-lc', 'apt-get update'], { stdio: 'inherit' }).status === 0)) process.exit(1)
    process.exit(installDeb(spec, id) ? 0 : 1)
  }
  if (cmd === 'check') {
    process.stdout.write(checkDeb(spec, id) ? 'yes\n' : 'no\n')
    process.exit(0)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
