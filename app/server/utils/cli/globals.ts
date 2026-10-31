import { discoverDockerApps, isReservedDockerAppId } from '../docker-app/dockerApps'
import { managerByKind } from './managers'
import { packageLabel } from './managers/types'
import { packageId, parseCliPackage, readCliPackages, readStoredPackages, writeCliPackages, type CliPackage, type CliPackageKind } from './packages'

export const GLOBAL_KINDS = ['npm', 'pnpm', 'bun', 'uv', 'cargo', 'nix'] as const
export type GlobalKind = (typeof GLOBAL_KINDS)[number]

const BIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/

export type GlobalName = { name: string; owned: boolean }
export type GlobalScan = { kind: GlobalKind; names: GlobalName[]; error?: string }

function uniqueSorted(names: string[]): string[] {
  return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function jsonSlice(text: string): unknown {
  const start = text.search(/[\[{]/)
  if (start < 0) return null
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  if (end < start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown
  } catch {
    return null
  }
}

function dependencyNames(doc: unknown): string[] {
  if (!doc || typeof doc !== 'object') return []
  const deps = (doc as { dependencies?: unknown }).dependencies
  if (!deps || typeof deps !== 'object' || Array.isArray(deps)) return []
  return Object.keys(deps).map((key) => packageLabel(key))
}

export function parseNpmLs(stdout: string): string[] {
  const names: string[] = []
  for (const chunk of stdout.split('---npm---')) names.push(...dependencyNames(jsonSlice(chunk)))
  return uniqueSorted(names)
}

export function parsePnpmList(stdout: string): string[] {
  const doc = jsonSlice(stdout)
  const rows = Array.isArray(doc) ? doc : [doc]
  return uniqueSorted(rows.flatMap((row) => dependencyNames(row)))
}

export function parseBunPackageJson(stdout: string): string[] {
  return uniqueSorted(dependencyNames(jsonSlice(stdout)))
}

function commandNames(stdout: string): string[] {
  const names: string[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('-')) continue
    const token = trimmed.split(/\s+/)[0]?.replace(/:$/, '') || ''
    if (token) names.push(token)
  }
  return names
}

export function parseUvTools(stdout: string): string[] {
  return uniqueSorted(commandNames(stdout).map((name) => {
    const eq = name.indexOf('==')
    return eq === -1 ? name : name.slice(0, eq)
  }))
}

export function parseCargoList(stdout: string): string[] {
  const names: string[] = []
  for (const line of stdout.split('\n')) {
    if (!line || line.startsWith(' ') || line.startsWith('\t')) continue
    const token = line.trim().split(/\s+/)[0]?.replace(/:$/, '') || ''
    if (!token) continue
    const at = token.lastIndexOf('@')
    names.push(at <= 0 ? token : token.slice(0, at))
  }
  return uniqueSorted(names)
}

export function parseDevboxList(stdout: string): string[] {
  const names: string[] = []
  for (const line of stdout.split('\n')) {
    const token = line.trim().replace(/^\*\s*/, '').split(/\s+/)[0] || ''
    if (!token) continue
    const hash = token.lastIndexOf('#')
    const attr = hash >= 0 ? token.slice(hash + 1) : token
    const at = attr.lastIndexOf('@')
    const name = at > 0 ? attr.slice(0, at) : attr
    if (BIN_NAME.test(name)) names.push(name)
  }
  return uniqueSorted(names)
}

const PARSERS: Record<GlobalKind, (stdout: string) => string[]> = {
  npm: parseNpmLs,
  pnpm: parsePnpmList,
  bun: parseBunPackageJson,
  uv: parseUvTools,
  cargo: parseCargoList,
  nix: parseDevboxList,
}

export function globalPackageName(kind: string, spec: string): string {
  const raw = spec.trim()
  const manager = managerByKind(kind)
  const labeled = manager ? manager.label(raw) : raw
  if (kind !== 'nix') return labeled
  const at = labeled.lastIndexOf('@')
  return at > 0 ? labeled.slice(0, at) : labeled
}

export function globalBin(kind: string, spec: string): string | undefined {
  const label = globalPackageName(kind, spec)
  if (BIN_NAME.test(label)) return label
  const tail = label.split('/').pop() || ''
  return BIN_NAME.test(tail) ? tail : undefined
}

export function globalAdoptInput(kind: string, spec: string) {
  const name = globalPackageName(kind, spec)
  const bin = globalBin(kind, name)
  return {
    kind,
    spec: name,
    interfaces: bin ? [{ type: 'cli' as const, command: bin }] : [],
  }
}

type ManagerRow = { tier?: string; kind: string; spec: string; bin?: string; clis?: string[] }

const BUILTIN_MANAGERS = new Set<string>([...GLOBAL_KINDS, 'deno', 'node', 'nodejs', 'npx', 'rustc'])

export function builtinManagerNames(packages: ManagerRow[] = []): Set<string> {
  const names = new Set(BUILTIN_MANAGERS)
  for (const pkg of packages) {
    if (pkg.tier !== 'core') continue
    const spec = globalPackageName(pkg.kind, pkg.spec)
    if (spec) names.add(spec)
    if (pkg.bin) names.add(pkg.bin)
    for (const cli of pkg.clis || []) if (cli) names.add(cli)
  }
  return names
}

export function markGlobalNames(kind: string, names: string[], packages: ManagerRow[]): GlobalName[] {
  const skip = builtinManagerNames(packages)
  const owned = new Set(packages.filter((pkg) => pkg.kind === kind).map((pkg) => globalPackageName(kind, pkg.spec)))
  return names.filter((name) => !skip.has(name)).map((name) => ({ name, owned: owned.has(name) }))
}

export function globalAdoptRefusal(
  kind: string,
  spec: string,
  packages: (ManagerRow & { id: string })[],
  takenIds: string[],
  reserved: (id: string) => boolean,
): string | null {
  if (!(GLOBAL_KINDS as readonly string[]).includes(kind)) return 'kind is invalid'
  const name = globalPackageName(kind, spec)
  if (!name) return 'package name is invalid'
  if (builtinManagerNames(packages).has(name)) return 'That package is a built-in manager'
  if (packages.some((pkg) => pkg.kind === kind && globalPackageName(kind, pkg.spec) === name)) return 'That package is already an app'
  const id = packageId(kind as CliPackageKind, name, globalBin(kind, name))
  if (takenIds.includes(id) || packages.some((pkg) => pkg.id === id)) return `Id "${id}" is already an app`
  if (reserved(id)) return `Id "${id}" is reserved`
  return null
}

function refuse(message: string): never {
  const err = new Error(message) as Error & { statusCode: number }
  err.statusCode = 400
  throw err
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function desktopShell(cmd: string): string[] {
  const env = [
    'export HOME=/home/bros',
    'export XDG_DATA_HOME=/home/bros/.local/share',
    'export XDG_STATE_HOME=/home/bros/.local/state',
    'export XDG_CACHE_HOME=/home/bros/.cache',
    'export XDG_CONFIG_HOME=/home/bros/.config',
    'export PATH="/home/bros/.cargo/bin:/home/bros/.local/bin:/home/bros/.local/share/pnpm:/home/bros/.bun/bin:/home/bros/.deno/bin:$PATH"',
    'eval "$(devbox global shellenv --init-hook 2>/dev/null)" || true',
  ].join('; ')
  const script = `if id abc >/dev/null 2>&1; then runuser -u abc -- bash -lc ${shellQuote(`${env}; ${cmd}`)}; else bash -lc ${shellQuote(`${env}; ${cmd}`)}; fi`
  return ['bash', '-lc', script]
}

const COMMANDS: Record<GlobalKind, string> = {
  npm: 'if ! command -v npm >/dev/null 2>&1; then echo \'npm not found\' >&2; exit 1; fi; npm ls -g --depth=0 --json --prefix /home/bros/.local || true; printf \'\\n---npm---\\n\'; npm ls -g --depth=0 --json --prefix /usr/local || true',
  pnpm: 'if ! command -v pnpm >/dev/null 2>&1; then echo \'pnpm not found\' >&2; exit 1; fi; pnpm list -g --depth=0 --json || true',
  bun: 'f=/home/bros/.bun/install/global/package.json; if [ -f "$f" ]; then cat "$f"; fi',
  uv: 'if ! command -v uv >/dev/null 2>&1; then echo \'uv not found\' >&2; exit 1; fi; uv tool list || true',
  cargo: 'if ! command -v cargo >/dev/null 2>&1; then echo \'cargo not found\' >&2; exit 1; fi; cargo install --list --root /home/bros/.cargo || true',
  nix: 'if ! command -v devbox >/dev/null 2>&1; then echo \'devbox not found\' >&2; exit 1; fi; devbox global list || true',
}

function failText(stderr: string, stdout: string): string {
  const line = (stderr || stdout).trim().split('\n').find(Boolean) || 'scan failed'
  return line.slice(0, 180)
}

export async function listGlobalPackages(): Promise<GlobalScan[]> {
  const packages = readCliPackages()
  const { execInBros } = await import('../docker')
  return Promise.all(GLOBAL_KINDS.map(async (kind) => {
    try {
      const res = await execInBros(desktopShell(COMMANDS[kind]), 60_000)
      const names = PARSERS[kind](res.stdout || '')
      if (res.code !== 0 && !names.length) return { kind, names: [], error: failText(res.stderr || '', res.stdout || '') }
      return { kind, names: markGlobalNames(kind, names, packages) }
    } catch (err) {
      return { kind, names: [], error: err instanceof Error ? err.message.slice(0, 180) : 'scan failed' }
    }
  }))
}

export function adoptGlobalPackage(kind: string, spec: string): CliPackage {
  const packages = readCliPackages()
  const dockerIds = discoverDockerApps().dockerApps.map((app) => app.id)
  const reason = globalAdoptRefusal(kind, spec, packages, dockerIds, isReservedDockerAppId)
  if (reason) refuse(reason)
  const next = parseCliPackage(globalAdoptInput(kind, spec), [])
  writeCliPackages([...readStoredPackages(), next])
  return next
}
