import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'
import { loadBootstrapConfig } from '../config'
import { discoverDockerApps } from '../docker-app/dockerApps'
import { guiAppProxyId } from '../../../ui/utils/gui'
import { managerByKind, packageManagers } from './managers'
import { debTracksLatest } from './managers/deb'
import { buildVersionScript, nodePin, nodeUpdateAvailable, parseOutdated, parseVersionScriptOutput, parseVersionText, versionCommand, versionShell } from './versionProbe'

export const CLI_PACKAGE_KINDS = packageManagers().map((manager) => manager.kind)
export type CliPackageKind = (typeof CLI_PACKAGE_KINDS)[number]

export const CLI_EXPOSE_TYPES = ['webui', 'api', 'openai', 'cli', 'gui'] as const
export type CliExposeType = (typeof CLI_EXPOSE_TYPES)[number]

export type CliExpose = {
  type: CliExposeType
  command?: string
  args?: string
  containerPort?: number
  publish?: number
  basePath?: string
}

export type AppTier = 'core' | 'addon' | 'custom'

export type AppService = { command: string; script?: string }

export type CliPackage = {
  id: string
  name?: string
  description?: string
  kind: CliPackageKind
  spec: string
  args?: string
  bin?: string
  clis?: string[]
  volumes?: string[]
  interfaces?: CliExpose[]
  services?: AppService[]
  uninstall?: string
  version?: string
  tier?: AppTier
  enabled?: boolean
  forwardHost?: boolean
  navPinned?: boolean
}

const BIN_SPEC = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/
const ARG_SPEC = /^--?[A-Za-z0-9][A-Za-z0-9._:=+-]*$/

const VOLUME_SPEC = /^\S+:\S+$/

function docker() {
  return import('../docker')
}

export function cliAppsDir(): string {
  return join(loadBootstrapConfig().dataDir, 'config', 'apps')
}

function legacyCliAppsDir(): string {
  return join(loadBootstrapConfig().dataDir, 'cli-apps')
}

export function cliPackagesFile(): string {
  return join(cliAppsDir(), 'packages.json')
}

export function seedCliPackages(): CliPackage[] {
  return []
}

export function cliLabel(kind: string, spec: string): string {
  return managerByKind(kind)?.label(spec) || ''
}

export function splitClis(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const out: string[] = []
  for (const part of parts) {
    const name = String(part).trim()
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function hasAppConfig(dir: string): boolean {
  if (!existsSync(dir)) return false
  return readdirSync(dir).some((name) => name.endsWith('.yml') || existsSync(join(dir, name, 'config.yml')))
}

export function hasCliApps(): boolean {
  const root = catalogRoot()
  if (['core', 'addon'].some((tier) => isDir(join(root, tier)))) return true
  if (existsSync(enabledAppsFile())) return true
  const dir = cliAppsDir()
  if (!existsSync(dir)) return false
  if (existsSync(cliPackagesFile())) return true
  return hasAppConfig(dir)
}

export function packageId(kind: CliPackageKind, spec: string, bin?: string): string {
  const raw = (bin || spec).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return (raw || kind).slice(0, 40)
}

function bad(message: string): never {
  const err = new Error(message) as Error & { statusCode: number }
  err.statusCode = 400
  throw err
}

function optionalPort(value: unknown, label: string): number | undefined {
  if (value == null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n <= 0) bad(`${label} is invalid`)
  return n
}

export function parseExposes(raw: unknown): CliExpose[] {
  if (raw == null || raw === '') return []
  if (!Array.isArray(raw)) bad('interfaces must be a list')
  return raw.map((row) => {
    if (!row || typeof row !== 'object') bad('interface is invalid')
    const rec = row as Record<string, unknown>
    const type = String(rec.type || '')
    if (!(CLI_EXPOSE_TYPES as readonly string[]).includes(type)) bad('interface type is invalid')
    const command = typeof rec.command === 'string' ? rec.command.trim() : ''
    const guiArgs = typeof rec.args === 'string' ? rec.args.trim() : ''
    if (type === 'cli') {
      const names = splitClis(command)
      if (names.some((name) => !BIN_SPEC.test(name))) bad('command is invalid')
    } else if (type === 'gui' && !BIN_SPEC.test(command)) bad('command is invalid')
    if (type === 'gui' && guiArgs) {
      if (guiArgs.includes('\n') || guiArgs.split(/\s+/).some((part) => !ARG_SPEC.test(part))) bad('args must be flags')
    }
    const containerPort = optionalPort(rec.containerPort, 'containerPort')
    const publish = optionalPort(rec.publish, 'publish')
    if (publish === 3000 || publish === 8080) bad('publish must not be 3000 or 8080')
    if (type === 'gui' && publish) bad('gui cannot publish a host port')
    if (type === 'webui' && (!containerPort || !publish)) bad('webui requires containerPort and publish')
    if ((type === 'api' || type === 'openai') && !containerPort) bad('containerPort required')
    const basePath = typeof rec.basePath === 'string' ? rec.basePath.trim() : ''
    return {
      type: type as CliExposeType,
      ...(command ? { command } : {}),
      ...(type === 'gui' && guiArgs ? { args: guiArgs } : {}),
      ...(containerPort ? { containerPort } : {}),
      ...(publish ? { publish } : {}),
      ...(basePath ? { basePath } : {}),
    }
  }).filter((row) => row.type !== 'cli' || !!row.command)
}

function relativeScript(value: string): string {
  const script = value.trim()
  if (!script || script.includes('\n') || script.startsWith('/') || script.split('/').includes('..')) bad('service script is invalid')
  return script
}

export function parseServices(raw: unknown): AppService[] {
  if (raw == null || raw === '') return []
  const rows = Array.isArray(raw) ? raw : [raw]
  const out: AppService[] = []
  for (const row of rows) {
    if (typeof row === 'string') {
      const command = row.trim()
      if (!command || command.includes('\n')) bad('service command is invalid')
      out.push({ command })
      continue
    }
    if (row && typeof row === 'object') {
      const rec = row as { command?: unknown; script?: unknown }
      if (typeof rec.script === 'string' && rec.script.trim()) {
        const script = relativeScript(rec.script)
        out.push({ command: script, script })
        continue
      }
      if (typeof rec.command === 'string') {
        const command = rec.command.trim()
        if (command && !command.includes('\n')) {
          out.push({ command })
          continue
        }
      }
    }
    bad('service command is invalid')
  }
  return out
}

function parseUninstall(kind: string, raw: unknown): string | undefined {
  if (kind !== 'run' || raw == null || raw === '') return undefined
  if (typeof raw !== 'string') bad('uninstall is invalid')
  const value = raw.trim()
  if (!value || value.includes('\n')) bad('uninstall is invalid')
  return value
}

function serviceYaml(services: AppService[]) {
  return services.map((row) => (row.script ? { script: row.script } : row.command))
}

export function parseVolumes(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('\n') : []
  const out: string[] = []
  for (const part of parts) {
    const vol = String(part).trim()
    if (!vol) continue
    if (!VOLUME_SPEC.test(vol)) bad('volume must be host:container')
    if (!out.includes(vol)) out.push(vol)
  }
  return out
}

export function parseCliPackage(input: { kind?: string; spec?: string; bin?: string; args?: string; clis?: string; interfaces?: unknown; services?: unknown; volumes?: unknown; uninstall?: unknown; name?: string; description?: string }, taken: string[] = []): CliPackage {
  const kind = input.kind
  const spec = (input.spec || '').trim()
  const args = (input.args || '').trim()
  const manager = kind ? managerByKind(kind) : undefined
  if (!manager || !kind) bad(`kind must be ${packageManagers().map((row) => row.kind).join(', ')}`)
  const specError = manager.parse(spec, args)
  if (specError) bad(specError)
  const parsed = parseExposes(input.interfaces)
  const cliNames = parsed.flatMap((row) => row.type === 'cli' ? splitClis(row.command) : [])
  const interfaces = [
    ...(cliNames.length ? [{ type: 'cli' as const, command: cliNames.join(', ') }] : []),
    ...parsed.filter((row) => row.type !== 'cli'),
  ]
  let bin = ''
  let clis: string[] = []
  if (cliNames.length) {
    bin = cliNames[0] || ''
    clis = cliNames.slice(1)
  } else if (input.interfaces == null) {
    bin = (input.bin || '').trim() || (kind === 'run' ? '' : cliLabel(kind, spec))
    clis = splitClis(input.clis).filter((name) => name !== bin)
  }
  if (bin && !BIN_SPEC.test(bin)) bad('bin name is invalid')
  if (clis.some((name) => !BIN_SPEC.test(name))) bad('cli name is invalid')
  const volumes = parseVolumes(input.volumes)
  const services = parseServices(input.services)
  const uninstall = parseUninstall(kind, input.uninstall)
  const name = (input.name || '').trim()
  const description = (input.description || '').trim()
  let id = packageId(kind, spec, bin || undefined)
  if (taken.includes(id)) {
    let n = 2
    while (taken.includes(`${id}-${n}`)) n += 1
    id = `${id}-${n}`.slice(0, 48)
  }
  return {
    id,
    kind,
    spec,
    ...(args ? { args } : {}),
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(bin ? { bin } : {}),
    ...(clis.length ? { clis } : {}),
    ...(volumes.length ? { volumes } : {}),
    ...(interfaces.length ? { interfaces } : {}),
    ...(services.length ? { services } : {}),
    ...(uninstall ? { uninstall } : {}),
  }
}

function asPackage(id: string, row: Record<string, unknown>): CliPackage | null {
  const kind = row.kind
  if (typeof row.spec !== 'string' || typeof kind !== 'string' || !managerByKind(kind)) return null
  const clis = splitClis(row.clis)
  let interfaces: CliExpose[] = []
  let volumes: string[] = []
  try {
    interfaces = parseExposes(row.interfaces)
  } catch {
    interfaces = []
  }
  try {
    volumes = parseVolumes(row.volumes)
  } catch {
    volumes = []
  }
  let services: AppService[] = []
  try {
    services = parseServices(row.services)
  } catch {
    services = []
  }
  let uninstall = ''
  if (kind === 'run' && typeof row.uninstall === 'string') {
    const value = row.uninstall.trim()
    if (value && !value.includes('\n')) uninstall = value
  }
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const description = typeof row.description === 'string' ? row.description.trim() : ''
  const version = typeof row.version === 'string' ? row.version.trim() : ''
  return {
    id,
    kind: kind as CliPackageKind,
    spec: row.spec,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(typeof row.args === 'string' && row.args ? { args: row.args } : {}),
    ...(typeof row.bin === 'string' && row.bin ? { bin: row.bin } : {}),
    ...(interfaces.length ? { interfaces } : {}),
    ...(volumes.length ? { volumes } : {}),
    ...(services.length ? { services } : {}),
    ...(uninstall ? { uninstall } : {}),
    ...(version && !version.includes('\n') ? { version } : {}),
    ...(clis.length ? { clis } : {}),
    ...(row.enabled === false ? { enabled: false } : {}),
    ...(row.enabled === true ? { enabled: true } : {}),
  }
}

function readAppFile(id: string, file: string): CliPackage | null {
  const doc = parse(readFileSync(file, 'utf8'))
  if (!doc || typeof doc !== 'object') return null
  return asPackage(id, doc as Record<string, unknown>)
}

function readYamlApps(dir: string): CliPackage[] {
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const packages: CliPackage[] = []
  const seen = new Set<string>()
  for (const name of names.sort()) {
    const file = join(dir, name, 'config.yml')
    if (!isDir(join(dir, name)) || !existsSync(file)) continue
    const pkg = readAppFile(name, file)
    if (!pkg) continue
    packages.push(pkg)
    seen.add(name)
  }
  for (const name of names.filter((entry) => entry.endsWith('.yml')).sort()) {
    const id = name.slice(0, -4)
    if (!id || seen.has(id)) continue
    const pkg = readAppFile(id, join(dir, name))
    if (pkg) packages.push(pkg)
  }
  return packages
}

function migrateFlatApps(dir: string) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.yml')) continue
    const id = name.slice(0, -4)
    if (!id) continue
    const src = join(dir, name)
    const dest = join(dir, id, 'config.yml')
    if (existsSync(dest)) {
      unlinkSync(src)
      continue
    }
    mkdirSync(join(dir, id), { recursive: true })
    renameSync(src, dest)
  }
}

function migrateLegacyCliApps() {
  const next = cliAppsDir()
  if (hasAppConfig(next)) return
  const prev = legacyCliAppsDir()
  if (!existsSync(prev)) return
  const packages = readYamlApps(prev)
  if (packages.length) writeCliPackages(packages)
}

function enabledAppsFile(): string {
  return join(loadBootstrapConfig().dataDir, 'config', 'enabled-apps')
}

function readEnabledAddonIds(): Set<string> {
  try {
    const ids = new Set<string>()
    for (const line of readFileSync(enabledAppsFile(), 'utf8').split('\n')) {
      const id = line.trim()
      if (id) ids.add(id)
    }
    return ids
  } catch {
    return new Set()
  }
}

function shippedDirs(): Map<string, 'core' | 'addon'> {
  const out = new Map<string, 'core' | 'addon'>()
  const root = catalogRoot()
  for (const tier of ['core', 'addon'] as const) {
    const dir = join(root, tier)
    if (!isDir(dir)) continue
    for (const name of readdirSync(dir)) {
      if (existsSync(join(dir, name, 'config.yml'))) out.set(name, tier)
    }
  }
  return out
}

function addonPackageIds(): Set<string> {
  return new Set(readCatalog().filter((pkg) => pkg.tier === 'addon').map((pkg) => pkg.id))
}

function writeEnabledAddonIds(ids: Iterable<string>) {
  const file = enabledAppsFile()
  const addons = addonPackageIds()
  const lines = [...new Set(ids)].map((id) => id.trim()).filter((id) => addons.has(id)).sort()
  mkdirSync(join(file, '..'), { recursive: true })
  if (!lines.length) {
    if (existsSync(file)) unlinkSync(file)
    return
  }
  writeFileSync(file, `${lines.join('\n')}\n`)
}

/** Copies of shipped apps are not custom apps. `enabled: false` stays off. Core never goes in the file. */
function absorbShippedCopies(dir: string) {
  const shipped = shippedDirs()
  if (!shipped.size) return
  const addons = addonPackageIds()
  const enable = readEnabledAddonIds()
  let changed = false
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (!shipped.has(name) || !isDir(path)) continue
    const file = join(path, 'config.yml')
    if (addons.has(name) && existsSync(file)) {
      const pkg = readAppFile(name, file)
      if (pkg && pkg.enabled !== false && !enable.has(name)) {
        enable.add(name)
        changed = true
      }
    }
    rmSync(path, { recursive: true, force: true })
  }
  if (changed) writeEnabledAddonIds(enable)
}

function rememberAddonEnable(packages: CliPackage[]) {
  const addons = addonPackageIds()
  const enable = readEnabledAddonIds()
  let changed = false
  for (const pkg of packages) {
    if (!addons.has(pkg.id)) continue
    if (pkg.enabled === false) {
      if (enable.delete(pkg.id)) changed = true
    } else if (pkg.enabled === true && !enable.has(pkg.id)) {
      enable.add(pkg.id)
      changed = true
    }
  }
  if (changed) writeEnabledAddonIds(enable)
}

export function readStoredPackages(): CliPackage[] {
  migrateLegacyCliApps()
  const dir = cliAppsDir()
  if (!existsSync(dir)) return seedCliPackages()
  migrateFlatApps(dir)
  absorbShippedCopies(dir)
  const shipped = shippedDirs()
  try {
    if (hasAppConfig(dir)) return readYamlApps(dir).filter((pkg) => !shipped.has(pkg.id))
    const raw = JSON.parse(readFileSync(cliPackagesFile(), 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    const packages = raw.flatMap((row) => {
      if (!row || typeof row !== 'object' || typeof (row as { id?: unknown }).id !== 'string') return []
      const pkg = asPackage((row as { id: string }).id, row as Record<string, unknown>)
      return pkg ? [pkg] : []
    })
    rememberAddonEnable(packages)
    return packages.filter((pkg) => !shipped.has(pkg.id))
  } catch {
    return seedCliPackages()
  }
}

/** Prod `/app` has no `lib/apps`. The checkout is `$BROS_HOST_REPO`. */
export function catalogRoot(): string {
  return join(repoRoot(), 'lib', 'apps')
}

export function readCatalog(): CliPackage[] {
  const root = catalogRoot()
  const out: CliPackage[] = []
  for (const tier of ['core', 'addon'] as const) {
    const dir = join(root, tier)
    if (!existsSync(dir)) continue
    for (const pkg of readYamlApps(dir)) out.push({ ...pkg, tier, enabled: tier === 'core' })
  }
  return out
}

export type AppUi = { forwardHost?: boolean; navPinned?: boolean }

function appUiFile() {
  return join(loadBootstrapConfig().dataDir, 'config', 'apps-ui.json')
}

export function readAppUi(): Record<string, AppUi> {
  try {
    const doc = JSON.parse(readFileSync(appUiFile(), 'utf8')) as Record<string, unknown>
    const out: Record<string, AppUi> = {}
    for (const [id, row] of Object.entries(doc)) {
      if (!APP_ID.test(id) || !row || typeof row !== 'object') continue
      const rec = row as AppUi
      out[id] = {
        ...(rec.forwardHost === false ? { forwardHost: false } : {}),
        ...(rec.navPinned === true ? { navPinned: true } : {}),
      }
    }
    return out
  } catch {
    return {}
  }
}

export function patchAppUi(id: string, patch: AppUi): AppUi {
  if (!APP_ID.test(id)) bad('id is invalid')
  const all = readAppUi()
  const next = { ...all[id] }
  if (patch.forwardHost !== undefined) next.forwardHost = patch.forwardHost
  if (patch.navPinned !== undefined) next.navPinned = patch.navPinned
  all[id] = next
  const file = appUiFile()
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(all)}\n`)
  return next
}

function withAppUi(pkg: CliPackage, ui = readAppUi()): CliPackage {
  const row = ui[pkg.id]
  const web = (pkg.interfaces || []).some((iface) => iface.type === 'webui' && iface.publish)
  return {
    ...pkg,
    ...(web ? { forwardHost: row?.forwardHost !== false, navPinned: row?.navPinned === true } : {}),
  }
}

export function readCliPackages(): CliPackage[] {
  const stored = readStoredPackages()
  const enabledIds = readEnabledAddonIds()
  const ui = readAppUi()
  const used = new Set<string>()
  const out: CliPackage[] = []
  for (const row of readCatalog()) {
    used.add(row.id)
    const enabled = row.tier === 'core' ? true : enabledIds.has(row.id)
    out.push(withAppUi({ ...row, enabled }, ui))
  }
  for (const row of stored) {
    if (used.has(row.id)) continue
    out.push(withAppUi({ ...row, tier: 'custom', enabled: row.enabled !== false }, ui))
  }
  return out
}

export function enabledCliPackages(packages = readCliPackages()): CliPackage[] {
  return packages.filter((pkg) => pkg.enabled !== false)
}

export function writeCliPackages(packages: CliPackage[]) {
  const dir = cliAppsDir()
  mkdirSync(dir, { recursive: true })
  migrateFlatApps(dir)
  absorbShippedCopies(dir)
  rememberAddonEnable(packages)
  const shipped = shippedDirs()
  const custom = packages.filter((pkg) => !shipped.has(pkg.id))
  for (const pkg of custom) {
    const doc = {
      id: pkg.id,
      name: pkg.name || pkg.bin || pkg.id,
      ...(pkg.description ? { description: pkg.description } : {}),
      kind: pkg.kind,
      spec: pkg.spec,
      ...(pkg.args ? { args: pkg.args } : {}),
      ...(pkg.bin ? { bin: pkg.bin } : {}),
      ...(pkg.clis?.length ? { clis: pkg.clis.join(', ') } : {}),
      ...(pkg.volumes?.length ? { volumes: pkg.volumes } : {}),
      ...(pkg.services?.length ? { services: serviceYaml(pkg.services) } : {}),
      ...(pkg.kind === 'run' && pkg.uninstall ? { uninstall: pkg.uninstall } : {}),
      ...(pkg.version ? { version: pkg.version } : {}),
      ...(pkg.enabled === false ? { enabled: false } : {}),
      ...(pkg.enabled === true ? { enabled: true } : {}),
      ...(pkg.interfaces?.length ? { interfaces: pkg.interfaces } : {}),
    }
    const flat = join(dir, `${pkg.id}.yml`)
    if (existsSync(flat)) unlinkSync(flat)
    const appDir = join(dir, pkg.id)
    mkdirSync(appDir, { recursive: true })
    writeFileSync(join(appDir, 'config.yml'), stringify(doc))
  }
  if (existsSync(cliPackagesFile())) unlinkSync(cliPackagesFile())
}

function appsComposeFile() {
  return join(loadBootstrapConfig().dataDir, 'config', 'apps-compose.yml')
}

export function readAppsComposeText(): string {
  const file = appsComposeFile()
  if (!existsSync(file)) return ''
  return readFileSync(file, 'utf8')
}

export type CliApplyAction = 'start' | 'skip' | 'recreate'

export function cliApplyAction(running: boolean, composeChanged: boolean, rebuild = false): CliApplyAction {
  if (!running) return 'start'
  if (composeChanged || rebuild) return 'recreate'
  return 'skip'
}

/** Docker build context for kind:run layers. The daemon reads the host data bind. */
export function enabledAppsDir(): string {
  return join(loadBootstrapConfig().dataDir, 'build', 'desktop')
}

export function claimDirArgs(dir: string, uid: number, gid: number, image = 'bros:latest'): string[] {
  return ['run', '--rm', '-u', '0', '--entrypoint', 'chown', '-v', `${dir}:/claim`, image, '-R', `${uid}:${gid}`, '/claim']
}

function claimImage(): string {
  for (const image of ['bros:latest', 'bros:dev']) {
    if (spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' }).status === 0) return image
  }
  return 'bros:latest'
}

// ponytail: one docker chown of this directory. A nested mount the daemon cannot chown still fails the retry.
function claimDir(dir: string) {
  const uid = process.getuid?.()
  const gid = process.getgid?.()
  if (uid == null || gid == null) return
  const result = spawnSync('docker', claimDirArgs(dir, uid, gid, claimImage()), { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`cannot claim ${dir}: docker chown failed`)
}

function needsClaim(dir: string): boolean {
  const uid = process.getuid?.()
  if (uid == null) return false
  if (statSync(dir).uid !== uid) return true
  return readdirSync(dir).some((name) => statSync(join(dir, name)).uid !== uid)
}

function ensureWritable(dir: string) {
  if (needsClaim(dir)) claimDir(dir)
}

function repoRoot(): string {
  return process.env.BROS_HOST_REPO?.trim() || loadBootstrapConfig().workingDir
}

function desktopDockerfileTemplate(): string {
  return join(repoRoot(), 'lib', 'desktop', 'Dockerfile')
}

function desktopAppStampFile(): string {
  return join(loadBootstrapConfig().dataDir, 'config', 'desktop-apps.stamp')
}

function appBuildDoc(pkg: CliPackage) {
  return {
    id: pkg.id,
    kind: pkg.kind,
    spec: pkg.spec,
    ...(pkg.args ? { args: pkg.args } : {}),
    ...(pkg.bin ? { bin: pkg.bin } : {}),
    ...(pkg.clis?.length ? { clis: pkg.clis } : {}),
    ...(pkg.volumes?.length ? { volumes: pkg.volumes } : {}),
    ...(pkg.interfaces?.length ? { interfaces: pkg.interfaces } : {}),
    ...(pkg.services?.length ? { services: serviceYaml(pkg.services) } : {}),
    ...(pkg.kind === 'run' && pkg.uninstall ? { uninstall: pkg.uninstall } : {}),
  }
}

function appSourceDir(id: string): string | null {
  const root = catalogRoot()
  for (const tier of ['core', 'addon'] as const) {
    const dir = join(root, tier, id)
    if (existsSync(join(dir, 'config.yml'))) return dir
  }
  const custom = join(cliAppsDir(), id)
  if (existsSync(join(custom, 'config.yml'))) return custom
  return null
}

function treeText(root: string): string {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name)
      if (isDir(path)) walk(path)
      else out.push(`${path.slice(root.length)}\n${readFileSync(path, 'utf8')}`)
    }
  }
  walk(root)
  return out.join('\n')
}

const APP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export function appLayerOrder<T extends { id: string; tier?: string }>(packages: T[]): T[] {
  return [...packages].sort((a, b) => (a.tier === 'core' ? 0 : 1) - (b.tier === 'core' ? 0 : 1) || a.id.localeCompare(b.id))
}

export function desktopAppsDockerfile(base: string, packages: { id: string; tier?: string; kind?: string }[]): string {
  const layers = appLayerOrder(packages).filter((pkg) => pkg.kind === 'run').map((pkg) => {
    if (!APP_ID.test(pkg.id)) throw new Error(`bad app id ${pkg.id}`)
    return `COPY --from=apps ${pkg.id} /opt/bros/enabled-apps/${pkg.id}\nRUN --mount=type=cache,id=bros-pkg,target=/var/cache/bros \\\n  BROS_IMAGE_INSTALL=1 /usr/local/bin/node /opt/bros/install.ts --only ${pkg.id}`
  })
  const body = base.replace(/\s+$/, '')
  if (!layers.length) return `${body}\n`
  return `${body}\n${layers.join('\n')}\n`
}

function runStampsFile() {
  return join(loadBootstrapConfig().dataDir, 'config', 'run-stamps.json')
}

export function readRunStamps(): Record<string, string> {
  try {
    const doc = JSON.parse(readFileSync(runStampsFile(), 'utf8')) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [id, stamp] of Object.entries(doc)) {
      if (APP_ID.test(id) && typeof stamp === 'string' && stamp) out[id] = stamp
    }
    return out
  } catch {
    return {}
  }
}

export function bumpRunStamp(id: string) {
  const all = readRunStamps()
  all[id] = String(Date.now())
  const file = runStampsFile()
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(all)}\n`)
  return all[id]
}

let rebuilds = 0
let updates = 0

function claim(rebuild: boolean) {
  if (rebuild ? rebuilds || updates : rebuilds) {
    const err = new Error('Desktop rebuild in progress') as Error & { statusCode: number }
    err.statusCode = 409
    throw err
  }
  if (rebuild) rebuilds += 1
  else updates += 1
  let released = false
  return () => {
    if (released) return
    released = true
    if (rebuild) rebuilds -= 1
    else updates -= 1
  }
}

export function packageUpdateAction(kind: string): 'rebuild' | 'exec' {
  return kind === 'run' ? 'rebuild' : 'exec'
}

/** Enabled package apps for the Desktop image. Returns whether the set differs from the last build. */
export function prepareDesktopAppBuild(): { hash: string; changed: boolean } {
  const dir = enabledAppsDir()
  mkdirSync(dir, { recursive: true })
  ensureWritable(dir)
  const packages = enabledCliPackages()
  const ids = new Set(packages.map((pkg) => pkg.id))
  for (const name of readdirSync(dir)) {
    if (name === '.gitkeep') continue
    const path = join(dir, name)
    if (name.endsWith('.yml') || (isDir(path) && !ids.has(name))) rmSync(path, { recursive: true, force: true })
  }
  const chunks: string[] = []
  for (const pkg of packages) {
    const dest = join(dir, pkg.id)
    rmSync(dest, { recursive: true, force: true })
    if (pkg.kind !== 'run') continue
    const src = appSourceDir(pkg.id)
    if (src) cpSync(src, dest, { recursive: true })
    else mkdirSync(dest, { recursive: true })
    writeFileSync(join(dest, 'config.yml'), stringify(appBuildDoc(pkg)))
    if (pkg.kind === 'run') {
      const stamp = readRunStamps()[pkg.id]
      if (stamp) writeFileSync(join(dest, 'force'), `${stamp}\n`)
    }
    chunks.push(treeText(dest))
  }
  writeFileSync(join(dir, 'Dockerfile'), desktopAppsDockerfile(readFileSync(desktopDockerfileTemplate(), 'utf8'), packages))
  const hash = createHash('sha256').update(chunks.join('\n')).digest('hex')
  const prev = existsSync(desktopAppStampFile()) ? readFileSync(desktopAppStampFile(), 'utf8').trim() : ''
  return { hash, changed: hash !== prev }
}

export function runBuildPending(changed: boolean, enabledRun: boolean): boolean {
  if (!changed) return false
  if (enabledRun) return true
  return existsSync(desktopAppStampFile())
}

/** A failed build must not stamp. An unchanged tree may. */
export function shouldWriteDesktopStamp(build: boolean, buildFailed: boolean, appsChanged: boolean): boolean {
  if (buildFailed) return false
  return build || !appsChanged
}

export function writeDesktopAppStamp(hash: string) {
  const file = desktopAppStampFile()
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, `${hash}\n`)
}

export function appsComposeBody(packages: CliPackage[]): string {
  const active = enabledCliPackages(packages)
  const volumes = active.flatMap((pkg) => pkg.volumes || [])
  const ports = active.flatMap((pkg) => {
    if (pkg.forwardHost === false) return []
    return (pkg.interfaces || [])
      .filter((iface) => iface.type !== 'gui' && iface.publish && iface.containerPort)
      .map((iface) => `${iface.publish}:${iface.containerPort}`)
  })
  if (!volumes.length && !ports.length) return ''
  const lines = ['services:', '  bros:']
  if (ports.length) lines.push('    ports:', ...ports.map((port) => `      - "${port}"`))
  if (volumes.length) lines.push('    volumes:', ...volumes.map((vol) => `      - ${vol}`))
  return `${lines.join('\n')}\n`
}

export function writeAppsCompose(packages: CliPackage[]) {
  const body = appsComposeBody(packages)
  const file = appsComposeFile()
  if (!body) {
    if (existsSync(file)) unlinkSync(file)
    return
  }
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, body)
}

export function volumeHostPaths(text: string): string[] {
  const hosts: string[] = []
  let inVolumes = false
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const indent = line.match(/^\s*/)?.[0].length ?? 0
    if (/^\s*volumes:\s*$/.test(line)) {
      inVolumes = true
      continue
    }
    if (inVolumes && indent <= 4 && !line.trim().startsWith('-')) inVolumes = false
    if (!inVolumes || !line.trim().startsWith('-')) continue
    const spec = line.trim().slice(2).trim().replace(/^["']|["']$/g, '')
    const host = spec.split(':')[0]
    if (host) hosts.push(host)
  }
  return hosts
}

/** Host paths added or removed between two apps-compose bodies. Ports do not count. */
export function changedVolumeHosts(before: string, after: string): string[] {
  const prev = new Set(volumeHostPaths(before))
  const next = new Set(volumeHostPaths(after))
  return [...next].filter(host => !prev.has(host)).concat([...prev].filter(host => !next.has(host)))
}

/** Docker apps whose compose mounts a host path the desktop recreate changed. */
export function dockerAppsRemounting(
  changedHosts: string[],
  apps: { id: string, compose: string }[],
  dataDir: string,
): string[] {
  if (!changedHosts.length) return []
  const hosts = new Set(changedHosts)
  return apps.filter((app) => {
    const text = app.compose
      .replaceAll('${BROS_DATA_DIR:?unset}', dataDir)
      .replaceAll('${BROS_DATA_DIR}', dataDir)
    return volumeHostPaths(text).some(host => hosts.has(host))
  }).map(app => app.id)
}

export async function applyCliPackages(opts?: { rebuild?: boolean; claimed?: boolean }): Promise<{ code: number; stderr: string; rebuild: boolean }> {
  let release: (() => void) | null = null
  try {
    const packages = readCliPackages()
    const before = readAppsComposeText()
    writeAppsCompose(packages)
    const changed = before.trim() !== readAppsComposeText().trim()
    const list = prepareDesktopAppBuild()
    const running = await (await docker()).brosContainerRunning()
    const rebuild = !!opts?.rebuild
    const action = cliApplyAction(running, changed, rebuild)
    if (action === 'skip') {
      const { queueDesktopEnsure } = await import('./ensure')
      queueDesktopEnsure()
      return { code: 0, stderr: '', rebuild: false }
    }
    if (!opts?.claimed) release = claim(true)
    const started = await (await docker()).rebuildBrosContainer({ build: rebuild || list.changed, forceRecreate: changed })
    if (started.code === 0 && changed) {
      const hosts = changedVolumeHosts(before, readAppsComposeText())
      const dataDir = process.env.BROS_DATA_DIR || loadBootstrapConfig().dataDir
      const apps = discoverDockerApps().dockerApps.map((app) => {
        const file = join(app.dir, 'docker-compose.yml')
        return { id: app.id, compose: existsSync(file) ? readFileSync(file, 'utf8') : '' }
      })
      for (const id of dockerAppsRemounting(hosts, apps, dataDir)) {
        await (await docker()).startDockerApp(id, { forceRecreate: true })
      }
    }
    return { code: started.code, stderr: started.stderr || '', rebuild: action === 'recreate' }
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 409) throw err
    const message = err instanceof Error ? err.message : 'Rebuild failed'
    return { code: 1, stderr: message, rebuild: !!opts?.rebuild }
  } finally {
    release?.()
  }
}

export type AppUpdateKind = 'package' | 'docker'

export function appUpdateKind(id: string, packages: { id: string }[], dockerAppIds: string[]): AppUpdateKind | null {
  if (packages.some((pkg) => pkg.id === id)) return 'package'
  if (dockerAppIds.includes(id)) return 'docker'
  return null
}

export function updateCommand(pkg: CliPackage): string[] {
  if (pkg.kind === 'nix') {
    const q = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`
    const spec = pkg.id === 'node' ? `nodejs@${nodePin()}` : pkg.spec.split('#')[0] || pkg.spec
    const fallback = pkg.id === 'node' ? ` || devbox global add ${q(`nodejs@${nodePin().split('.')[0]}`)}` : ''
    return ['bash', '-lc', `export HOME=/home/bros; devbox global add ${q(spec)}${fallback}`]
  }
  if (pkg.kind === 'npm') return ['npm', 'update', '-g', '--prefix', '/home/bros/.local', pkg.spec]
  if (pkg.kind === 'pnpm') return ['pnpm', 'update', '-g', pkg.spec]
  if (pkg.kind === 'bun') return ['bun', 'update', '-g', pkg.spec]
  if (pkg.kind === 'apt') return ['apt-get', 'install', '-y', pkg.spec]
  if (pkg.kind === 'deb') return ['node', '/opt/bros/managers/deb.ts', 'install', pkg.id, pkg.spec]
  if (pkg.kind === 'deno') return ['deno', 'install', '-g', '-A', '-f', pkg.spec]
  if (pkg.kind === 'uv') {
    const name = pkg.spec.split('==')[0] || pkg.spec
    if (name === 'uv') return ['uv', 'self', 'update']
    return ['uv', 'tool', 'upgrade', name]
  }
  if (pkg.kind === 'cargo') {
    const at = pkg.spec.lastIndexOf('@')
    const name = at > 0 ? pkg.spec.slice(0, at) : pkg.spec
    const version = at > 0 ? pkg.spec.slice(at + 1) : ''
    const cmd = ['cargo', 'install', '--locked', '--root', '/home/bros/.cargo', name]
    if (version) cmd.push('--version', version)
    return cmd
  }
  return ['true']
}

export async function updateApp(id: string): Promise<{ kind: AppUpdateKind; code: number; stderr: string }> {
  const packages = enabledCliPackages()
  const dockerApps = discoverDockerApps().dockerApps.map((dockerApp) => dockerApp.id)
  const kind = appUpdateKind(id, packages, dockerApps)
  if (!kind) {
    const err = new Error('App not found') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  if (kind === 'package') {
    const pkg = packages.find((row) => row.id === id)
    if (!pkg) throw new Error('App not found')
    const rebuild = packageUpdateAction(pkg.kind) === 'rebuild'
    const release = claim(rebuild)
    try {
      if (rebuild) {
        bumpRunStamp(pkg.id)
        const res = await applyCliPackages({ rebuild: true, claimed: true })
        return { kind, code: res.code, stderr: res.stderr || '' }
      }
      const res = await (await docker()).execInBros(updateCommand(pkg), 600_000)
      return { kind, code: res.code, stderr: res.stderr || '' }
    } finally {
      release()
    }
  }
  const res = await (await docker()).pullDockerApp(id)
  return { kind, code: res.code, stderr: res.stderr || '' }
}

export type AppCheck = {
  kind: AppUpdateKind
  available: boolean
  version?: string
  latest?: string
  run?: boolean
}

/** Desktop user. `cursor --version` exits when this probe runs as root. */
const VERSION_USER = 'bros'

async function installedVersion(pkg: CliPackage): Promise<string | undefined> {
  const cmd = versionCommand(pkg)
  if (!cmd) return undefined
  const res = await (await docker()).execInBros(['bash', '-lc', versionShell(cmd)], 60_000, VERSION_USER)
  return parseVersionText(pkg.kind, pkg.spec, res.stdout || '') || undefined
}

export async function probeAppVersions(): Promise<{ id: string; version: string }[]> {
  const packages = enabledCliPackages()
  const script = buildVersionScript(packages)
  if (!script) return []
  const res = await (await docker()).execInBros(['bash', '-lc', versionShell(script)], 60_000, VERSION_USER)
  return parseVersionScriptOutput(res.stdout || '', packages)
}

export async function checkAppUpdate(id: string): Promise<AppCheck> {
  const packages = enabledCliPackages()
  const dockerApps = discoverDockerApps().dockerApps.map((dockerApp) => dockerApp.id)
  const kind = appUpdateKind(id, packages, dockerApps)
  if (!kind) {
    const err = new Error('App not found') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  if (kind === 'docker') {
    const res = await (await docker()).pullDockerApp(id, { dryRun: true })
    const text = `${res.stdout}\n${res.stderr}`
    return { kind, available: /download|pulling|newer/i.test(text) && !/up to date/i.test(text) }
  }
  const pkg = packages.find((row) => row.id === id)
  if (!pkg || pkg.kind === 'run') return { kind, available: false, run: pkg?.kind === 'run' }
  if (pkg.kind === 'nix') {
    const version = await installedVersion(pkg)
    if (pkg.id === 'node') {
      const pin = nodePin()
      const available = nodeUpdateAvailable(version, pin)
      return { kind, available, ...(version ? { version } : {}), ...(available ? { latest: pin } : {}) }
    }
    return { kind, available: false, ...(version ? { version } : {}) }
  }
  const version = await installedVersion(pkg)
  if (pkg.kind === 'deb') {
    if (!debTracksLatest(pkg.spec)) return { kind, available: false, ...(version ? { version } : {}) }
    const res = await (await docker()).execInBros(['node', '/opt/bros/managers/deb.ts', 'check', pkg.id, pkg.spec], 120_000)
    return { kind, available: (res.stdout || '').trim() === 'yes', ...(version ? { version } : {}) }
  }
  const res = await (await docker()).execInBros(updateCommand(pkg).slice(0, 1).concat(['outdated', '-g', pkg.spec]), 120_000)
  const parsed = parseOutdated(`${res.stdout || ''}\n${res.stderr || ''}`, pkg.spec)
  const available = res.code !== 0 && !!(res.stdout || '').trim()
  const current = parsed.current || version
  return {
    kind,
    available,
    ...(current ? { version: current } : {}),
    ...(available && parsed.latest ? { latest: parsed.latest } : {}),
  }
}

function requireAddon(id: string): CliPackage {
  const row = readCatalog().find((pkg) => pkg.id === id && pkg.tier === 'addon')
  if (!row) {
    const err = new Error('Addon app not found') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  return row
}

export function disableAddonApp(id: string) {
  requireAddon(id)
  readStoredPackages()
  const ids = readEnabledAddonIds()
  ids.delete(id)
  writeEnabledAddonIds(ids)
}

export function enableAddonApp(id: string) {
  requireAddon(id)
  readStoredPackages()
  const ids = readEnabledAddonIds()
  ids.add(id)
  writeEnabledAddonIds(ids)
}

export function appServicesFile() {
  return join(cliAppsDir(), 'running.json')
}

type RunningDoc = { ids: string[]; restarts: Record<string, number> }

function readRunningDoc(): RunningDoc {
  try {
    const doc = JSON.parse(readFileSync(appServicesFile(), 'utf8')) as { ids?: unknown; restarts?: unknown }
    const ids = Array.isArray(doc?.ids) ? doc.ids.filter((id): id is string => typeof id === 'string' && !!id) : []
    const restarts: Record<string, number> = {}
    if (doc?.restarts && typeof doc.restarts === 'object') {
      for (const [id, n] of Object.entries(doc.restarts)) {
        if (APP_ID.test(id) && typeof n === 'number' && n >= 0) restarts[id] = n
      }
    }
    return { ids, restarts }
  } catch {
    return { ids: [], restarts: {} }
  }
}

function writeRunningDoc(doc: RunningDoc) {
  const file = appServicesFile()
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ ids: [...doc.ids].sort(), restarts: doc.restarts })}\n`)
}

export function readRunningAppIds(): string[] {
  return readRunningDoc().ids
}

function servicePkg(id: string) {
  const pkg = readCliPackages().find((row) => row.id === id)
  if (!pkg || pkg.enabled === false || !pkg.services?.length) {
    const err = new Error('App service not found') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  return pkg
}

export function setAppService(id: string, on: boolean) {
  servicePkg(id)
  const doc = readRunningDoc()
  const ids = new Set(doc.ids)
  if (on) ids.add(id)
  else ids.delete(id)
  writeRunningDoc({ ids: [...ids], restarts: doc.restarts })
  return { id, serviceRunning: on }
}

export function restartAppService(id: string) {
  servicePkg(id)
  const doc = readRunningDoc()
  const ids = new Set(doc.ids)
  ids.add(id)
  const restart = (doc.restarts[id] || 0) + 1
  writeRunningDoc({ ids: [...ids], restarts: { ...doc.restarts, [id]: restart } })
  return { id, serviceRunning: true, restart }
}

export async function startAppGui(id: string, command?: string) {
  const pkg = readCliPackages().find((row) => row.id === id)
  const faces = (pkg?.interfaces || []).filter((iface) => iface.type === 'gui' && iface.command)
  const iface = command ? faces.find((row) => row.command === command) : faces[0]
  if (!pkg || !iface?.command || !BIN_SPEC.test(iface.command) || !BIN_SPEC.test(id)) {
    const err = new Error('GUI app not found') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  const args = iface.args ? iface.args.split(/\s+/).filter(Boolean) : []
  const dock = await docker()
  await dock.ensureAppsRunning()
  const res = await dock.execInBros(['/app/lib/desktop/desktop-gui.sh', 'start', guiAppProxyId(id, iface.command), '--', iface.command, ...args])
  if (res.code !== 0) {
    throw createError(dock.dockerCommandError(500, 'Desktop app failed to start', res.stderr || res.stdout || 'Desktop app failed to start'))
  }
  return res
}

async function endAppGui(id: string, command: string | undefined, action: 'close' | 'stop') {
  if (!BIN_SPEC.test(id) || (command && !BIN_SPEC.test(command))) {
    const err = new Error('GUI app not found') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  const cmd = command || readCliPackages().find((row) => row.id === id)?.interfaces?.find((iface) => iface.type === 'gui')?.command || ''
  if (!cmd || !BIN_SPEC.test(cmd)) {
    const err = new Error('GUI app not found') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  return (await docker()).execInBros(['/app/lib/desktop/desktop-gui.sh', action, guiAppProxyId(id, cmd)])
}

export function stopAppGui(id: string, command?: string) {
  return endAppGui(id, command, 'stop')
}

export function closeAppGui(id: string, command?: string) {
  return endAppGui(id, command, 'close')
}
