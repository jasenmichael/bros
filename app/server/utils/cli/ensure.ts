import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadBootstrapConfig } from '../config'
import { enabledCliPackages, type CliPackage } from './packages'

const CORE_ORDER = ['node', 'cargo', 'uv', 'bun', 'pnpm', 'deno']

export type EnsureStatus = {
  running: boolean
  current: string
  version: string
  failures: string[]
  steps: string[]
}

export function ensurePackages(packages: CliPackage[]): CliPackage[] {
  const enabled = packages.filter((pkg) => pkg.enabled !== false && pkg.kind !== 'run')
  const byId = new Map(enabled.map((pkg) => [pkg.id, pkg]))
  const out: CliPackage[] = []
  for (const id of CORE_ORDER) {
    const pkg = byId.get(id)
    if (!pkg) continue
    out.push(pkg)
    byId.delete(id)
  }
  return out.concat([...byId.values()].sort((a, b) => a.id.localeCompare(b.id)))
}

export function presentBins(pkg: { bin?: string; clis?: string[] }): string[] {
  if (pkg.clis?.length) return [...pkg.clis]
  return pkg.bin ? [pkg.bin] : []
}

function ensureDir() {
  return join(loadBootstrapConfig().dataDir, 'config', 'apps')
}

function statusFile() {
  return join(loadBootstrapConfig().dataDir, 'var', 'logs', 'ensure.json')
}

export function readEnsureStatus(): EnsureStatus {
  try {
    const doc = JSON.parse(readFileSync(statusFile(), 'utf8')) as Record<string, unknown>
    const failures = Array.isArray(doc.failures) ? doc.failures.filter((id): id is string => typeof id === 'string') : []
    const steps = Array.isArray(doc.steps) ? doc.steps.filter((id): id is string => typeof id === 'string') : []
    return {
      running: doc.running === true,
      current: typeof doc.current === 'string' ? doc.current : '',
      version: typeof doc.version === 'string' ? doc.version : '',
      failures,
      steps,
    }
  } catch {
    return { running: false, current: '', version: '', failures: [], steps: [] }
  }
}

export function stagePackageRemoval(pkg: Pick<CliPackage, 'id' | 'kind' | 'spec' | 'bin' | 'clis' | 'args' | 'uninstall'>) {
  const dir = join(ensureDir(), 'ensure', 'remove', pkg.id)
  mkdirSync(dir, { recursive: true })
  const lines = [
    `id: ${JSON.stringify(pkg.id)}`,
    `kind: ${JSON.stringify(pkg.kind)}`,
    `spec: ${JSON.stringify(pkg.spec)}`,
  ]
  if (pkg.bin) lines.push(`bin: ${JSON.stringify(pkg.bin)}`)
  if (pkg.clis?.length) lines.push(`clis: ${JSON.stringify(pkg.clis.join(', '))}`)
  if (pkg.args) lines.push(`args: ${JSON.stringify(pkg.args)}`)
  if (pkg.uninstall) lines.push(`uninstall: ${JSON.stringify(pkg.uninstall)}`)
  writeFileSync(join(dir, 'config.yml'), `${lines.join('\n')}\n`)
  appendFileSync(join(ensureDir(), 'ensure.remove'), `${pkg.id}\n`)
}

function writeList(packages: CliPackage[]) {
  const dir = ensureDir()
  mkdirSync(join(dir, 'ensure'), { recursive: true })
  const lines = packages.map((pkg) => [pkg.id, pkg.kind, pkg.spec, presentBins(pkg).join(',')].join('\t'))
  writeFileSync(join(dir, 'ensure.list'), lines.length ? `${lines.join('\n')}\n` : '')
  const body = packages.map((pkg) => ({
    id: pkg.id,
    kind: pkg.kind,
    spec: pkg.spec,
    ...(pkg.bin ? { bin: pkg.bin } : {}),
    ...(pkg.clis?.length ? { clis: pkg.clis } : {}),
    ...(pkg.args ? { args: pkg.args } : {}),
  }))
  writeFileSync(join(dir, 'ensure', 'packages.json'), `${JSON.stringify(body)}\n`)
}

let chain: Promise<void> = Promise.resolve()

export function enqueueDesktop(task: () => Promise<void>): Promise<void> {
  const run = chain.then(task, task)
  chain = run.then(() => undefined, () => undefined)
  return run
}

async function runEnsure() {
  const packages = ensurePackages(enabledCliPackages())
  writeList(packages)
  try {
    const { execInBros } = await import('../docker')
    const res = await execInBros(['bash', '/app/lib/desktop/ensure.sh'], 1_800_000)
    if (res.code !== 0) console.error('desktop ensure', res.stderr || res.stdout)
  } catch (err) {
    console.error('desktop ensure', err)
    const status = readEnsureStatus()
    mkdirSync(join(statusFile(), '..'), { recursive: true })
    writeFileSync(statusFile(), `${JSON.stringify({ ...status, running: false })}\n`)
  }
}

export function queueDesktopEnsure() {
  void enqueueDesktop(runEnsure)
}
