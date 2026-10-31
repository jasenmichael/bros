import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'pathe'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { createError } from 'h3'
import { loadBootstrapConfig } from '../config'
import { duplicateHomePath, ensureHomeDirs, parseHomePaths } from '../homePaths'
import { POPULAR_PROVIDER_IDS } from '../providers/presets'

export const CORE_DOCKER_APP_ID = 'ollama'
export const WHISPER_DOCKER_APP_ID = 'whisper'

export type DockerAppKind = 'core' | 'addon' | 'custom'
export type DockerAppSourceLabel = 'shipped' | 'custom' | string

const interfaceSchema = z.object({
  type: z.enum(['webui', 'api', 'openai', 'cli', 'gui']),
  service: z.string().min(1).optional(),
  /** Process listen port inside the container. */
  containerPort: z.number().int().positive().optional(),
  /** Host publish port (Open/Pin / curl 127.0.0.1). */
  publish: z.number().int().positive().optional(),
  slug: z.string().regex(/^[a-z][a-z0-9_-]*$/).optional(),
  basePath: z.string().optional(),
  command: z.string().optional(),
  bin: z.string().optional(),
  /** Optional path. The desktop page is one stream. */
  entry: z.string().optional(),
  /** Same-host path proxy at `/${dockerApp.id}/`. Off unless `public: true`. */
  proxy: z.object({ public: z.boolean() }).optional(),
}).superRefine((val, ctx) => {
  if (val.type !== 'cli' && !val.service) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'service required', path: ['service'] })
  }
  if ((val.type === 'webui' || val.type === 'api' || val.type === 'openai') && !val.containerPort) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'containerPort required', path: ['containerPort'] })
  }
  if (val.type === 'webui' && !val.publish) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'webui requires publish', path: ['publish'] })
  }
  if (val.type === 'gui' && !val.command) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'gui requires command', path: ['command'] })
  }
  if (val.type === 'gui' && val.publish) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'gui cannot publish a host port', path: ['publish'] })
  }
  if (val.publish === 3000 || val.publish === 8080) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'publish must not be 3000 or 8080', path: ['publish'] })
  }
})

const dockerAppMetaSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  slug: z.string().regex(/^[a-z][a-z0-9_-]*$/).optional(),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  interfaces: z.array(interfaceSchema).default([]),
  home: z.array(z.string()).optional(),
}).superRefine((val, ctx) => {
  try {
    parseHomePaths(val.home)
  } catch (err) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: err instanceof Error ? err.message : 'home is invalid', path: ['home'] })
  }
})

export function parseDockerAppMeta(raw: unknown) {
  return dockerAppMetaSchema.parse(raw)
}

export type DockerAppInterface = z.infer<typeof interfaceSchema>
export type DockerAppMeta = z.infer<typeof dockerAppMetaSchema> & {
  source: DockerAppSourceLabel
  kind: DockerAppKind
  dir: string
  packageSlug: string
  disabled: boolean
  editable: boolean
  gitUrl?: string
  error?: string
}

export type DiscoverOptions = {
  shippedRoot?: string
  customRoot?: string
  dataDir?: string
  env?: NodeJS.ProcessEnv
}

export const RESERVED_SLUGS = new Set([
  'api', 'chat', 'models', 'providers', 'apps', 'settings', 'docs',
  'login', 'setup', 'status', 'gui', 'terminal', '_nuxt', 'favicon.ico',
  ...POPULAR_PROVIDER_IDS,
])

const DOCKER_APP_ID_RE = /^[a-z][a-z0-9_-]*$/

/** Addon ids from `BROS_APPS_ENABLED` (comma list) that boot with the stack. Core ids ignored. */
export function enabledAddonIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const out = new Set<string>()
  for (const raw of (env.BROS_APPS_ENABLED || '').split(',')) {
    const id = raw.trim().toLowerCase()
    if (id && id !== CORE_DOCKER_APP_ID && id !== WHISPER_DOCKER_APP_ID) out.add(id)
  }
  return out
}

/** Root of shipped core docker apps (`lib/apps/core`). Tests may override via `shippedRoot`. */
export function shippedDockerAppsRoot(opts?: DiscoverOptions): string {
  if (opts?.shippedRoot) return opts.shippedRoot
  return join(loadBootstrapConfig().workingDir, 'lib/apps/core')
}

function repoRootFromShipped(shippedRoot: string): string {
  const norm = shippedRoot.replace(/\\/g, '/')
  // .../lib/apps/core → repo root (three levels up)
  if (/(?:^|\/)lib\/apps\/core$/.test(norm) || /(?:^|\/)apps\/core$/.test(norm)) {
    return join(shippedRoot, '..', '..', '..')
  }
  // .../lib/dockerApps (legacy tests) → repo root
  return join(shippedRoot, '..', '..')
}

function appsTierRoot(opts: DiscoverOptions | undefined, tier: 'core' | 'addon'): string {
  if (tier === 'core') return shippedDockerAppsRoot(opts)
  const workingDir = opts?.shippedRoot
    ? repoRootFromShipped(opts.shippedRoot)
    : loadBootstrapConfig().workingDir
  return join(workingDir, 'lib', 'apps', tier)
}

export function dockerAppDataDir(opts?: DiscoverOptions): string {
  if (opts?.dataDir) return opts.dataDir
  return loadBootstrapConfig().dataDir
}

function configKind(dir: string): string | null {
  const file = join(dir, 'config.yml')
  if (!existsSync(file)) return null
  try {
    const raw = parseYaml(readFileSync(file, 'utf8')) as { kind?: unknown }
    return raw && typeof raw === 'object' && typeof raw.kind === 'string' ? raw.kind : null
  } catch {
    return null
  }
}

function metaFile(dir: string): string | null {
  if (configKind(dir) === 'docker' && existsSync(join(dir, 'docker-compose.yml'))) return join(dir, 'config.yml')
  return null
}

function hasDockerAppPackage(dir: string) {
  return metaFile(dir) !== null
}

export function customDockerAppsRoot(opts?: DiscoverOptions): string {
  if (opts?.customRoot) return opts.customRoot
  const dataDir = opts?.dataDir || loadBootstrapConfig().dataDir
  return join(dataDir, 'config', 'apps')
}

export function isShippedCoreId(id: string, opts?: DiscoverOptions): boolean {
  return configKind(join(shippedDockerAppsRoot(opts), id)) === 'docker'
}

export function isShippedAddonId(id: string, opts?: DiscoverOptions): boolean {
  if (id === CORE_DOCKER_APP_ID || id === WHISPER_DOCKER_APP_ID) return false
  return configKind(join(appsTierRoot(opts, 'addon'), id)) === 'docker'
}

export function isReservedDockerAppId(id: string, opts?: DiscoverOptions): boolean {
  if (RESERVED_SLUGS.has(id) || id === CORE_DOCKER_APP_ID || id === WHISPER_DOCKER_APP_ID) return true
  if (isShippedCoreId(id, opts)) return true
  return isShippedAddonId(id, opts)
}

/** Ollama always. Whisper follows Settings (default off). Addons: `BROS_APPS_ENABLED` or SQLite. */
export function defaultDockerAppAutostart(id: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (id === CORE_DOCKER_APP_ID) return true
  if (id === WHISPER_DOCKER_APP_ID) return false
  return enabledAddonIds(env).has(id)
}

/** Boot: Ollama always. Whisper gated in `autostartDockerApps` via Settings. Addons: SQLite or BROS_APPS_ENABLED. */
export function shouldAutostartDockerApp(
  dockerApp: { id: string; disabled?: boolean; interfaces?: Array<{ type: string }> },
  settings: { autostart: boolean },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (dockerApp.id === CORE_DOCKER_APP_ID) return true
  if (dockerApp.id === WHISPER_DOCKER_APP_ID) return false
  if (dockerApp.disabled) return false
  if (settings.autostart) return true
  return enabledAddonIds(env).has(dockerApp.id)
}

function readDockerAppDir(
  dir: string,
  source: DockerAppSourceLabel,
  kind: DockerAppKind,
  extra: { disabled?: boolean; gitUrl?: string } = {},
): DockerAppMeta | null {
  const metaPath = metaFile(dir)
  const composePath = join(dir, 'docker-compose.yml')
  if (!metaPath || !existsSync(composePath)) return null
  const disabled = extra.disabled === true
  const editable = source === 'custom'

  try {
    const raw = parseYaml(readFileSync(metaPath, 'utf8'))
    const meta = dockerAppMetaSchema.parse(raw)
    const idFromDir = dir.split(/[/\\]/).filter(Boolean).pop()
    if (idFromDir !== meta.id) {
      return {
        ...meta,
        source,
        kind,
        dir,
        packageSlug: meta.slug || meta.id,
        disabled,
        editable,
        gitUrl: extra.gitUrl,
        error: `Directory name "${idFromDir}" must match id "${meta.id}"`,
      }
    }
    parseYaml(readFileSync(composePath, 'utf8'))
    // Docker apps: compose owns home/volume binds. `home` on config.yml is ignored.
    const home = kind === 'core' ? meta.home : undefined
    const pack = { ...meta, home }
    const packageSlug = pack.slug || pack.id
    if (RESERVED_SLUGS.has(packageSlug)) {
      return { ...pack, source, kind, dir, packageSlug, disabled, editable, gitUrl: extra.gitUrl, error: `Slug "${packageSlug}" is reserved` }
    }
    for (const iface of pack.interfaces) {
      if (iface.type === 'webui' && !iface.containerPort) {
        return { ...pack, source, kind, dir, packageSlug, disabled, editable, gitUrl: extra.gitUrl, error: 'webui interface requires containerPort' }
      }
      const slug = iface.slug || packageSlug
      if (RESERVED_SLUGS.has(slug)) {
        return { ...pack, source, kind, dir, packageSlug, disabled, editable, gitUrl: extra.gitUrl, error: `Interface slug "${slug}" is reserved` }
      }
    }
    return { ...pack, source, kind, dir, packageSlug, disabled, editable, gitUrl: extra.gitUrl }
  } catch (err) {
    const id = dir.split(/[/\\]/).filter(Boolean).pop() || 'unknown'
    return {
      id,
      name: id,
      description: '',
      interfaces: [],
      source,
      kind,
      dir,
      packageSlug: id,
      disabled,
      editable,
      gitUrl: extra.gitUrl,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function scanRoot(
  root: string,
  source: DockerAppSourceLabel,
  kind: DockerAppKind,
  extra: { disabledIds?: Set<string>; gitUrl?: string } = {},
): DockerAppMeta[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const disabled = extra.disabledIds?.has(d.name) === true
      return readDockerAppDir(join(root, d.name), source, kind, { disabled, gitUrl: extra.gitUrl })
    })
    .filter((x): x is DockerAppMeta => Boolean(x))
}

function collectSlugs(s: DockerAppMeta): string[] {
  return [
    s.packageSlug,
    ...s.interfaces.filter((i) => i.type === 'webui').map((i) => i.slug || s.packageSlug),
  ]
}

function gitRemoteUrl(repoRoot: string): string | null {
  const cfg = join(repoRoot, '.git', 'config')
  if (!existsSync(cfg)) return null
  const text = readFileSync(cfg, 'utf8')
  const match = text.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(\S+)/)
  return match?.[1] || null
}

function scanCustomTree(customRoot: string): { direct: DockerAppMeta[]; cloned: DockerAppMeta[] } {
  if (!existsSync(customRoot)) return { direct: [], cloned: [] }
  const direct: DockerAppMeta[] = []
  const cloned: DockerAppMeta[] = []
  for (const d of readdirSync(customRoot, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const child = join(customRoot, d.name)
    if (hasDockerAppPackage(child)) {
      const meta = readDockerAppDir(child, 'custom', 'custom')
      if (meta) direct.push(meta)
      continue
    }
    const nested = join(child, 'apps')
    if (!existsSync(nested)) continue
    const gitUrl = gitRemoteUrl(child) || undefined
    const source = gitUrl || 'git repo'
    cloned.push(...scanRoot(nested, source, 'custom', { gitUrl }))
  }
  return { direct, cloned }
}

function rejectConflicts(
  incoming: DockerAppMeta[],
  takenIds: Set<string>,
  takenSlugs: Set<string>,
  errors: string[],
  label: string,
): DockerAppMeta[] {
  const accepted: DockerAppMeta[] = []
  for (const s of incoming) {
    if (takenIds.has(s.id) || s.id === CORE_DOCKER_APP_ID || s.id === WHISPER_DOCKER_APP_ID) {
      errors.push(`${label} docker app "${s.id}" conflicts with a shipped or reserved id — rejected`)
      continue
    }
    const slugs = collectSlugs(s)
    if (slugs.some((slug) => takenSlugs.has(slug) || RESERVED_SLUGS.has(slug))) {
      errors.push(`${label} docker app "${s.id}" conflicts with a shipped or reserved slug — rejected`)
      continue
    }
    accepted.push(s)
    takenIds.add(s.id)
    for (const slug of slugs) takenSlugs.add(slug)
  }
  return accepted
}

export function discoverDockerApps(opts?: DiscoverOptions): { dockerApps: DockerAppMeta[]; errors: string[] } {
  const errors: string[] = []

  // Core docker apps under lib/apps/core (ollama, whisper). Package apps (node, …) skip — not kind docker.
  const dockerAppsOnly = scanRoot(shippedDockerAppsRoot(opts), 'shipped', 'core').map((s) => ({
    ...s,
    kind: 'core' as const,
    source: 'shipped' as const,
    disabled: false,
    editable: false,
  }))
  const addons = scanRoot(appsTierRoot(opts, 'addon'), 'shipped', 'addon')
    .map((s) => ({
      ...s,
      kind: 'addon' as const,
      source: 'shipped' as const,
      editable: false,
      disabled: false,
    }))

  const shipped: DockerAppMeta[] = [...dockerAppsOnly, ...addons]
  const takenIds = new Set(shipped.map((s) => s.id))
  const takenSlugs = new Set<string>()
  for (const s of shipped) {
    for (const slug of collectSlugs(s)) takenSlugs.add(slug)
  }

  const customTree = scanCustomTree(customDockerAppsRoot(opts))
  const custom = rejectConflicts(customTree.direct, takenIds, takenSlugs, errors, 'Custom')
  const cloned = rejectConflicts(customTree.cloned, takenIds, takenSlugs, errors, 'Git')

  const dockerApps = [...dockerAppsOnly, ...addons, ...custom, ...cloned]
  const dup = duplicateHomePath(dockerApps)
  if (dup) errors.push(`home path "${dup}" is claimed by two packs`)
  const dataDir = opts?.dataDir
  if (dataDir && !dup) {
    for (const dockerApp of dockerApps) {
      if (dockerApp.kind !== 'core') continue
      ensureHomeDirs(dataDir, dockerApp.home || [])
    }
  }
  return { dockerApps, errors }
}

export function getDockerApp(id: string, opts?: DiscoverOptions): DockerAppMeta | undefined {
  return discoverDockerApps(opts).dockerApps.find((s) => s.id === id)
}

export function projectName(id: string) {
  return `bros-${id}`
}

export function readDockerAppFiles(id: string, opts?: DiscoverOptions): { configYml: string; composeYml: string } {
  const dockerApp = getDockerApp(id, opts)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: `DockerApp "${id}" not found` })
  return {
    configYml: readFileSync(join(dockerApp.dir, 'config.yml'), 'utf8'),
    composeYml: readFileSync(join(dockerApp.dir, 'docker-compose.yml'), 'utf8'),
  }
}

function assertWritableAdditional(dockerApp: DockerAppMeta) {
  if (dockerApp.kind === 'core' || dockerApp.kind === 'addon' || dockerApp.source === 'shipped') {
    throw createError({ statusCode: 400, statusMessage: `Shipped docker app "${dockerApp.id}" is not editable` })
  }
  if (!dockerApp.editable) {
    throw createError({ statusCode: 400, statusMessage: `Docker app "${dockerApp.id}" is not editable in the UI` })
  }
}

export function writeCustomDockerApp(input: {
  id: string
  configYml: string
  composeYml: string
}, opts?: DiscoverOptions): DockerAppMeta {
  const id = input.id.trim().toLowerCase()
  if (!DOCKER_APP_ID_RE.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'id must be a lowercase slug' })
  }
  if (isReservedDockerAppId(id, opts)) {
    throw createError({ statusCode: 400, statusMessage: `Id "${id}" is reserved` })
  }
  const existing = getDockerApp(id, opts)
  if (existing) {
    throw createError({ statusCode: 400, statusMessage: `DockerApp "${id}" already exists` })
  }

  let meta
  try {
    meta = dockerAppMetaSchema.parse(parseYaml(input.configYml))
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err instanceof Error ? err.message : 'Invalid config.yml' })
  }
  if (meta.id !== id) {
    throw createError({ statusCode: 400, statusMessage: `config.yml id "${meta.id}" must match "${id}"` })
  }
  try {
    parseYaml(input.composeYml)
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err instanceof Error ? err.message : 'Invalid docker-compose.yml' })
  }

  const dir = join(customDockerAppsRoot(opts), id)
  mkdirSync(dir, { recursive: true })
  const body = input.configYml.endsWith('\n') ? input.configYml : `${input.configYml}\n`
  const config = /^kind:\s*docker\s*$/m.test(body) ? body : `kind: docker\n${body}`
  writeFileSync(join(dir, 'config.yml'), config)
  writeFileSync(join(dir, 'docker-compose.yml'), input.composeYml.endsWith('\n') ? input.composeYml : `${input.composeYml}\n`)

  const created = readDockerAppDir(dir, 'custom', 'custom')
  if (!created) throw createError({ statusCode: 500, statusMessage: 'Failed to write docker app' })
  if (created.error) throw createError({ statusCode: 400, statusMessage: created.error })
  return created
}

export function saveDockerAppFiles(id: string, input: {
  configYml: string
  composeYml: string
}, opts?: DiscoverOptions): { dockerApp: DockerAppMeta; composeChanged: boolean } {
  const dockerApp = getDockerApp(id, opts)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: `DockerApp "${id}" not found` })
  assertWritableAdditional(dockerApp)

  let meta
  try {
    meta = dockerAppMetaSchema.parse(parseYaml(input.configYml))
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err instanceof Error ? err.message : 'Invalid config.yml' })
  }
  if (meta.id !== id) {
    throw createError({ statusCode: 400, statusMessage: `config.yml id cannot change from "${id}"` })
  }
  try {
    parseYaml(input.composeYml)
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err instanceof Error ? err.message : 'Invalid docker-compose.yml' })
  }

  const composePath = join(dockerApp.dir, 'docker-compose.yml')
  const before = existsSync(composePath) ? readFileSync(composePath, 'utf8') : ''
  const body = input.configYml.endsWith('\n') ? input.configYml : `${input.configYml}\n`
  const stored = !/^kind:\s*docker\s*$/m.test(body) ? `kind: docker\n${body}` : body
  writeFileSync(join(dockerApp.dir, 'config.yml'), stored)
  writeFileSync(composePath, input.composeYml.endsWith('\n') ? input.composeYml : `${input.composeYml}\n`)
  const after = readFileSync(composePath, 'utf8')
  const updated = readDockerAppDir(dockerApp.dir, dockerApp.source, dockerApp.kind, { gitUrl: dockerApp.gitUrl })
  if (!updated) throw createError({ statusCode: 500, statusMessage: 'Failed to save docker app' })
  if (updated.error) throw createError({ statusCode: 400, statusMessage: updated.error })
  return { dockerApp: updated, composeChanged: before !== after }
}

export function dockerAppRepoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '').replace(/\.git$/i, '')
  const part = trimmed.split(/[:/]/).filter(Boolean).pop() || ''
  return part.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}

export function assertGitUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed || /[\s;|&$`]/.test(trimmed) || trimmed.startsWith('-')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid git URL' })
  }
  if (!/^(https?:\/\/|git@|ssh:\/\/)/i.test(trimmed)) {
    throw createError({ statusCode: 400, statusMessage: 'Git URL must be https, ssh, or git@' })
  }
  return trimmed
}

function runGit(args: string[], cwd: string, timeoutMs = 120_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ code: 124, stdout, stderr: stderr || `timeout after ${timeoutMs}ms` })
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += String(d) })
    child.stderr.on('data', (d) => { stderr += String(d) })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

export async function cloneDockerAppRepo(input: {
  url: string
  name?: string
}, opts?: DiscoverOptions): Promise<{ name: string; source: string; dockerApps: DockerAppMeta[] }> {
  const url = assertGitUrl(input.url)
  const name = (input.name?.trim() || dockerAppRepoNameFromUrl(url)).toLowerCase()
  if (!DOCKER_APP_ID_RE.test(name)) {
    throw createError({ statusCode: 400, statusMessage: 'Repo folder name must be a lowercase slug' })
  }
  const customRoot = customDockerAppsRoot(opts)
  mkdirSync(customRoot, { recursive: true })
  const dest = join(customRoot, name)
  if (existsSync(dest)) {
    throw createError({ statusCode: 400, statusMessage: `Repo folder "${name}" already exists` })
  }
  const result = await runGit(['clone', '--depth', '1', url, dest], customRoot)
  if (result.code !== 0) {
    throw createError({ statusCode: 400, statusMessage: result.stderr || 'git clone failed' })
  }
  const { dockerApps, errors } = discoverDockerApps(opts)
  const fromRepo = dockerApps.filter((s) => s.gitUrl === url || (s.source === url) || s.dir.startsWith(join(dest, 'apps')))
  if (!fromRepo.length) {
    throw createError({
      statusCode: 400,
      statusMessage: errors[0] || `Clone succeeded but ${name}/apps/ has no valid docker app packages`,
    })
  }
  return { name, source: url, dockerApps: fromRepo }
}

function repoRootForDockerApp(dockerApp: DockerAppMeta, opts?: DiscoverOptions): string | null {
  const base = customDockerAppsRoot(opts)
  if (!dockerApp.dir.startsWith(base)) return null
  const rel = dockerApp.dir.slice(base.length).replace(/^[/\\]+/, '')
  const name = rel.split(/[/\\]/)[0]
  return name ? join(base, name) : null
}

export async function pullDockerAppRepo(id: string, opts?: DiscoverOptions): Promise<{
  composeChanged: boolean
  source: string
}> {
  const dockerApp = getDockerApp(id, opts)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: `DockerApp "${id}" not found` })
  const repoRoot = repoRootForDockerApp(dockerApp, opts)
  if (!repoRoot) {
    throw createError({ statusCode: 400, statusMessage: `DockerApp "${id}" is not from a git repo` })
  }
  const composePath = join(dockerApp.dir, 'docker-compose.yml')
  const before = existsSync(composePath) ? readFileSync(composePath, 'utf8') : ''
  const result = await runGit(['pull', '--ff-only'], repoRoot)
  if (result.code !== 0) {
    throw createError({ statusCode: 400, statusMessage: result.stderr || 'git pull failed' })
  }
  const after = existsSync(composePath) ? readFileSync(composePath, 'utf8') : ''
  return { composeChanged: before !== after, source: dockerApp.source }
}
