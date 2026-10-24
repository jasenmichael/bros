import { existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { managers } from './managers/index.mjs'

const argv = process.argv.slice(2)
let only = ''
let kind = ''
let removeId = ''
const rest = []
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--only') only = argv[i + 1] || ''
  else if (argv[i] === '--kind') kind = argv[i + 1] || ''
  else if (argv[i] === '--remove') removeId = argv[i + 1] || ''
  else if (argv[i - 1] !== '--only' && argv[i - 1] !== '--kind' && argv[i - 1] !== '--remove') rest.push(argv[i])
}
const listPath = rest[0] || (only ? '/opt/bros/enabled-apps/packages.json' : '/opt/bros/apps/packages.json')
const imageInstall = process.env.BROS_IMAGE_INSTALL === '1'
const homeDir = '/home/bros'
const npmPrefix = imageInstall ? '/usr/local' : '/home/bros/.local'
const pnpmHome = imageInstall ? '/usr/local' : '/home/bros/.local/share/pnpm'
const bunHome = imageInstall ? '/usr/local' : '/home/bros/.bun'
const denoHome = imageInstall ? '/usr/local' : '/home/bros/.deno'
const statePath = '/opt/bros/apps/applied.json'
const npmPrefixes = [npmPrefix, '/usr/local']
const runHomes = [homeDir]
const livePath = [
  `${homeDir}/.local/share/devbox/global/default/.devbox/nix/profile/default/bin`,
  `${homeDir}/.nix-profile/bin`,
  `${homeDir}/.cargo/bin`,
  `${homeDir}/.local/sidecar-bins`,
  `${homeDir}/.local/bin`,
  `${homeDir}/.local/devbox-bin`,
  pnpmHome,
  `${bunHome}/bin`,
  `${denoHome}/bin`,
].join(':')

function q(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function commOf(pid) {
  try {
    return readFileSync(`/proc/${pid}/comm`, 'utf8').trim()
  } catch {
    return ''
  }
}

function ppidOf(pid) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8')
    return status.match(/^PPid:\s+(\d+)/m)?.[1] || ''
  } catch {
    return ''
  }
}

function ttydPts() {
  const pids = readdirSync('/proc').filter((pid) => /^\d+$/.test(pid))
  const ttyd = new Set(pids.filter((pid) => commOf(pid) === 'ttyd'))
  if (!ttyd.size) return ''
  for (const pid of pids) {
    let parent = ppidOf(pid)
    let under = false
    for (let hop = 0; parent && hop < 4; hop += 1) {
      if (ttyd.has(parent)) {
        under = true
        break
      }
      parent = ppidOf(parent)
    }
    if (!under) continue
    try {
      const link = readlinkSync(`/proc/${pid}/fd/0`)
      if (link.startsWith('/dev/pts/')) return link
    } catch {
      // process exited
    }
  }
  return ''
}

function shellBody(cmd) {
  const cache = imageInstall
    ? 'export npm_config_cache=/var/cache/bros/npm; export npm_config_store_dir=/var/cache/bros/pnpm; export npm_config_package_import_method=copy; export BUN_INSTALL_CACHE_DIR=/var/cache/bros/bun; export DENO_DIR=/var/cache/bros/deno; export UV_CACHE_DIR=/var/cache/bros/uv; export UV_TOOL_DIR=/usr/local/share/uv/tools; export UV_TOOL_BIN_DIR=/usr/local/bin; export RUSTUP_HOME=/usr/local/rustup; mkdir -p /var/cache/bros/npm /var/cache/bros/pnpm /var/cache/bros/bun /var/cache/bros/deno /var/cache/bros/uv /var/cache/bros/cargo /var/cache/bros/cargo-target /usr/local/share/uv/tools /usr/local/rustup; '
    : ''
  return `export HOME=${q(homeDir)}; export PATH=${q(livePath)}:\$PATH; export npm_config_prefix=${q(npmPrefix)}; export PNPM_HOME=${q(pnpmHome)}; export npm_config_store_dir=${q(`${pnpmHome}/store`)}; export BUN_INSTALL=${q(bunHome)}; export DENO_INSTALL_ROOT=${q(denoHome)}; export DENO_DIR=${q(`${denoHome}/cache`)}; mkdir -p ${q(homeDir)} ${q(npmPrefix)} ${q(`${homeDir}/.local/bin`)} ${q(pnpmHome)} ${q(`${bunHome}/bin`)} ${q(`${denoHome}/bin`)}; ${cache}${cmd}`
}

function sh(cmd) {
  const dest = ttydPts()
  const body = shellBody(cmd)
  const wrapped = dest
    ? `{ printf '\\r\\n$ %s\\r\\n' ${q(cmd)}; ${body}; } > ${q(dest)} 2>&1`
    : body
  const result = spawnSync('bash', ['-lc', `set -o pipefail; ${wrapped}`], { stdio: 'inherit' })
  return result.status === 0
}

function asDesktopUser(cmd) {
  const inner = shellBody(cmd)
  if (spawnSync('id', ['abc'], { stdio: 'ignore' }).status === 0) {
    return `runuser -u abc -- bash -c ${q(inner)}`
  }
  return inner
}

function shUser(cmd) {
  return sh(asDesktopUser(cmd))
}

function capture(cmd) {
  const result = spawnSync('bash', ['-lc', shellBody(cmd)], { encoding: 'utf8' })
  return `${result.stdout || ''}\n${result.stderr || ''}`
}

function captureUser(cmd) {
  const result = spawnSync('bash', ['-lc', asDesktopUser(cmd)], { encoding: 'utf8' })
  return `${result.stdout || ''}\n${result.stderr || ''}`
}

function flags(pkg) {
  if (!pkg.args || pkg.kind !== 'npm') return ''
  return ` ${String(pkg.args).trim().split(/\s+/).filter(Boolean).map(q).join(' ')}`
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function splitClis(value) {
  const parts = Array.isArray(value) ? value : String(value || '').split(',')
  const out = []
  for (const part of parts) {
    const name = String(part).trim()
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

function parseAppYaml(text) {
  const doc = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!line || /^[\s-]/.test(line) || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!match) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    doc[match[1]] = value
  }
  return doc
}

function readApps() {
  const dir = dirname(listPath)
  let names = []
  try {
    names = readdirSync(dir).sort()
  } catch {
    names = []
  }
  const out = []
  const seen = new Set()
  for (const name of names) {
    const config = join(dir, name, 'config.yml')
    if (!existsSync(config)) continue
    const doc = parseAppYaml(readFileSync(config, 'utf8'))
    if (doc.enabled === 'false') continue
    seen.add(name)
    const appDir = join(dir, name)
    let force = ''
    try { force = readFileSync(join(appDir, 'force'), 'utf8').trim() } catch { /* no stamp */ }
    out.push({ id: name, dir: appDir, ...doc, clis: splitClis(doc.clis), force })
  }
  for (const name of names) {
    if (!name.endsWith('.yml')) continue
    const id = name.slice(0, -4)
    if (!id || seen.has(id)) continue
    const doc = parseAppYaml(readFileSync(join(dir, name), 'utf8'))
    if (doc.enabled === 'false') continue
    seen.add(id)
    out.push({ id, dir, ...doc, clis: splitClis(doc.clis) })
  }
  if (!out.length) {
    const json = readJson(listPath, [])
    for (const pkg of Array.isArray(json) ? json : []) out.push({ ...pkg, dir, clis: splitClis(pkg.clis), force: '' })
  }
  return only ? out.filter((pkg) => pkg.id === only) : out
}

const ctx = {
  imageInstall,
  cacheRoot: '/var/cache/bros',
  pkgRoot: '/opt/bros/pkg',
  sh,
  shUser,
  capture,
  captureUser,
  q,
  flags,
  npmPrefix,
  npmPrefixes,
  runHomes,
  aptUpdated: false,
  exists(...parts) {
    return existsSync(join(...parts))
  },
  dpkg(spec) {
    return spawnSync('dpkg', ['-s', String(spec)], { stdio: 'ignore' }).status === 0
  },
}

function apply(pkg) {
  const manager = managers[pkg.kind]
  if (!manager) return false
  return manager.apply(pkg, ctx)
}

function remove(pkg) {
  const manager = managers[pkg.kind]
  if (manager) manager.remove(pkg, ctx)
}

function present(pkg) {
  if (imageInstall && pkg.bin && existsSync(join('/usr/local/bin', String(pkg.bin)))) return true
  const manager = managers[pkg.kind]
  if (!manager) return false
  return manager.present(pkg, ctx)
}

if (removeId) {
  const roots = ['/opt/bros/apps/ensure/remove', '/app/lib/apps/core', '/app/lib/apps/addon', '/opt/bros/apps', dirname(listPath)]
  let pkg = null
  for (const root of roots) {
    const config = join(root, removeId, 'config.yml')
    if (!existsSync(config)) continue
    const doc = parseAppYaml(readFileSync(config, 'utf8'))
    pkg = { id: removeId, dir: join(root, removeId), ...doc, clis: splitClis(doc.clis) }
    break
  }
  if (pkg) remove(pkg)
  process.exit(0)
}

if (kind) {
  let failed = false
  for (const pkg of readApps().filter((pkg) => pkg.kind === kind)) {
    if (present(pkg)) continue
    if (!apply(pkg)) {
      console.error(`cli install failed: ${pkg.id}`)
      failed = true
    }
  }
  process.exit(failed ? 1 : 0)
}

mkdirSync(dirname(statePath), { recursive: true })
const wanted = readApps()
const applied = readJson(statePath, [])
const prev = Array.isArray(applied) ? applied : []
const wantIds = new Set(wanted.map((pkg) => pkg.id))
const next = only ? prev.filter((pkg) => !wantIds.has(pkg.id)) : []
let failed = false
if (!only) {
  for (const pkg of prev) {
    if (!wantIds.has(pkg.id)) remove(pkg)
  }
}
for (const pkg of wanted) {
  const old = prev.find((row) => row.id === pkg.id)
  const same = old && old.kind === pkg.kind && old.spec === pkg.spec && old.bin === pkg.bin && (old.args || '') === (pkg.args || '') && splitClis(old.clis).join(',') === splitClis(pkg.clis).join(',')
  if (present(pkg) && (!old || same)) {
    next.push(pkg)
    continue
  }
  if (old) remove(old)
  if (!apply(pkg)) {
    console.error(`cli install failed: ${pkg.id}`)
    failed = true
    continue
  }
  next.push(pkg)
}
writeFileSync(statePath, JSON.stringify(next))
if (process.env.PUID && process.env.PGID) {
  const own = [`${homeDir}/.npm`, `${homeDir}/.local/lib`, `${homeDir}/.local/bin`, `${homeDir}/.local/sidecar-bins`, `${homeDir}/.local/devbox-bin`, pnpmHome, bunHome, denoHome]
  for (const dir of own) {
    if (existsSync(dir)) spawnSync('chown', ['-R', `${process.env.PUID}:${process.env.PGID}`, dir], { stdio: 'ignore' })
  }
}
if (failed) process.exit(1)
