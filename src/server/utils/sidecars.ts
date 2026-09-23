import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'pathe'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { createError } from 'h3'
import { loadBootstrapConfig } from './config'
import { POPULAR_PROVIDER_IDS } from './providerPresets'

export const CORE_SIDECAR_ID = 'ollama'
export const WHISPER_SIDECAR_ID = 'whisper'

export type SidecarKind = 'core' | 'addon' | 'additional'
export type SidecarSourceLabel = 'shipped' | 'custom' | string

const interfaceSchema = z.object({
  type: z.enum(['webui', 'api', 'openai', 'cli']),
  service: z.string().min(1).optional(),
  /** Process listen port inside the container. */
  containerPort: z.number().int().positive().optional(),
  /** Host publish port (Open/Pin / curl 127.0.0.1). */
  publish: z.number().int().positive().optional(),
  slug: z.string().regex(/^[a-z][a-z0-9_-]*$/).optional(),
  basePath: z.string().optional(),
  command: z.string().optional(),
  /** Same-host path proxy at `/${sidecar.id}/`. Off unless `public: true`. */
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
  if (val.publish === 3000 || val.publish === 8080) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'publish must not be 3000 or 8080', path: ['publish'] })
  }
})

const sidecarMetaSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  slug: z.string().regex(/^[a-z][a-z0-9_-]*$/).optional(),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  interfaces: z.array(interfaceSchema).default([]),
})

export function parseSidecarMeta(raw: unknown) {
  return sidecarMetaSchema.parse(raw)
}

export type SidecarInterface = z.infer<typeof interfaceSchema>
export type SidecarMeta = z.infer<typeof sidecarMetaSchema> & {
  source: SidecarSourceLabel
  kind: SidecarKind
  dir: string
  packageSlug: string
  disabled: boolean
  editable: boolean
  gitUrl?: string
  error?: string
}

export type DiscoverOptions = {
  shippedRoot?: string
  dataDir?: string
  env?: NodeJS.ProcessEnv
}

export const RESERVED_SLUGS = new Set([
  'api', 'chat', 'models', 'providers', 'sidecars', 'settings', 'docs',
  'login', 'setup', 'status', '_nuxt', 'favicon.ico',
  ...POPULAR_PROVIDER_IDS,
])

const SIDECAR_ID_RE = /^[a-z][a-z0-9_-]*$/

function truthyOff(value: string | undefined): boolean {
  if (value == null) return false
  const v = value.trim().toLowerCase()
  return v === '0' || v === 'false' || v === 'off' || v === 'no'
}

/** Addon ids skipped at autostart. Ollama cannot be disabled. */
export function disabledAddonIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const out = new Set<string>()
  for (const raw of (env.BROS_SIDECARS_DISABLE || '').split(',')) {
    const id = raw.trim().toLowerCase()
    if (id && id !== CORE_SIDECAR_ID && id !== WHISPER_SIDECAR_ID) out.add(id)
  }
  for (const [key, val] of Object.entries(env)) {
    if (!key.startsWith('BROS_SIDECAR_')) continue
    if (key === 'BROS_SIDECARS_DISABLE' || key === 'BROS_SIDECARS_DIR') continue
    if (!truthyOff(val)) continue
    const id = key.slice('BROS_SIDECAR_'.length).toLowerCase()
    if (id && id !== CORE_SIDECAR_ID && id !== WHISPER_SIDECAR_ID) out.add(id)
    const hyphen = id.replace(/_/g, '-')
    if (hyphen !== id && hyphen !== CORE_SIDECAR_ID && hyphen !== WHISPER_SIDECAR_ID) out.add(hyphen)
  }
  return out
}

export function shippedSidecarsRoot(opts?: DiscoverOptions): string {
  if (opts?.shippedRoot) return opts.shippedRoot
  const fromEnv = (opts?.env || process.env).BROS_SIDECARS_DIR?.trim()
  if (fromEnv) return fromEnv
  const { workingDir } = loadBootstrapConfig()
  return join(workingDir, 'sidecars')
}

export function sidecarDataDir(opts?: DiscoverOptions): string {
  if (opts?.dataDir) return opts.dataDir
  return loadBootstrapConfig().dataDir
}

function packageDir(root: string, kind: 'core' | 'addon', id: string) {
  return join(root, kind, id)
}

function hasSidecarPackage(dir: string) {
  return existsSync(join(dir, 'sidecar.yml')) && existsSync(join(dir, 'docker-compose.yml'))
}

export function customSidecarsRoot(opts?: DiscoverOptions): string {
  return join(shippedSidecarsRoot(opts), 'custom')
}

export function isShippedCoreId(id: string, opts?: DiscoverOptions): boolean {
  return hasSidecarPackage(packageDir(shippedSidecarsRoot(opts), 'core', id))
}

export function isShippedAddonId(id: string, opts?: DiscoverOptions): boolean {
  if (id === CORE_SIDECAR_ID || id === WHISPER_SIDECAR_ID) return false
  return hasSidecarPackage(packageDir(shippedSidecarsRoot(opts), 'addon', id))
}

export function isReservedSidecarId(id: string, opts?: DiscoverOptions): boolean {
  if (RESERVED_SLUGS.has(id) || id === CORE_SIDECAR_ID || id === WHISPER_SIDECAR_ID) return true
  return isShippedCoreId(id, opts) || isShippedAddonId(id, opts)
}

export function defaultSidecarAutostart(id: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (id === CORE_SIDECAR_ID) return true
  if (id === WHISPER_SIDECAR_ID) return false
  if (disabledAddonIds(env).has(id)) return false
  return isShippedAddonId(id, { env })
}

export function shouldAutostartSidecar(
  sidecar: { id: string; disabled?: boolean },
  settings: { autostart: boolean },
): boolean {
  if (sidecar.id === CORE_SIDECAR_ID) return true
  if (sidecar.id === WHISPER_SIDECAR_ID) return false
  if (sidecar.disabled) return false
  return settings.autostart
}

function readSidecarDir(
  dir: string,
  source: SidecarSourceLabel,
  kind: SidecarKind,
  extra: { disabled?: boolean; gitUrl?: string } = {},
): SidecarMeta | null {
  const metaPath = join(dir, 'sidecar.yml')
  const composePath = join(dir, 'docker-compose.yml')
  if (!existsSync(metaPath) || !existsSync(composePath)) return null
  const disabled = extra.disabled === true
  const editable = source === 'custom'

  try {
    const raw = parseYaml(readFileSync(metaPath, 'utf8'))
    const meta = sidecarMetaSchema.parse(raw)
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
    const packageSlug = meta.slug || meta.id
    if (RESERVED_SLUGS.has(packageSlug)) {
      return { ...meta, source, kind, dir, packageSlug, disabled, editable, gitUrl: extra.gitUrl, error: `Slug "${packageSlug}" is reserved` }
    }
    for (const iface of meta.interfaces) {
      if (iface.type === 'webui' && !iface.containerPort) {
        return { ...meta, source, kind, dir, packageSlug, disabled, editable, gitUrl: extra.gitUrl, error: 'webui interface requires containerPort' }
      }
      const slug = iface.slug || packageSlug
      if (RESERVED_SLUGS.has(slug)) {
        return { ...meta, source, kind, dir, packageSlug, disabled, editable, gitUrl: extra.gitUrl, error: `Interface slug "${slug}" is reserved` }
      }
    }
    return { ...meta, source, kind, dir, packageSlug, disabled, editable, gitUrl: extra.gitUrl }
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
  source: SidecarSourceLabel,
  kind: SidecarKind,
  extra: { disabledIds?: Set<string>; gitUrl?: string } = {},
): SidecarMeta[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const disabled = extra.disabledIds?.has(d.name) === true
      return readSidecarDir(join(root, d.name), source, kind, { disabled, gitUrl: extra.gitUrl })
    })
    .filter((x): x is SidecarMeta => Boolean(x))
}

function collectSlugs(s: SidecarMeta): string[] {
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

function scanCustomTree(customRoot: string): { direct: SidecarMeta[]; cloned: SidecarMeta[] } {
  if (!existsSync(customRoot)) return { direct: [], cloned: [] }
  const direct: SidecarMeta[] = []
  const cloned: SidecarMeta[] = []
  for (const d of readdirSync(customRoot, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const child = join(customRoot, d.name)
    if (hasSidecarPackage(child)) {
      const meta = readSidecarDir(child, 'custom', 'additional')
      if (meta) direct.push(meta)
      continue
    }
    const nested = join(child, 'sidecars')
    if (!existsSync(nested)) continue
    const gitUrl = gitRemoteUrl(child) || undefined
    const source = gitUrl || 'git repo'
    cloned.push(...scanRoot(nested, source, 'additional', { gitUrl }))
  }
  return { direct, cloned }
}

function rejectConflicts(
  incoming: SidecarMeta[],
  takenIds: Set<string>,
  takenSlugs: Set<string>,
  errors: string[],
  label: string,
): SidecarMeta[] {
  const accepted: SidecarMeta[] = []
  for (const s of incoming) {
    if (takenIds.has(s.id) || s.id === CORE_SIDECAR_ID || s.id === WHISPER_SIDECAR_ID) {
      errors.push(`${label} sidecar "${s.id}" conflicts with a shipped or reserved id — rejected`)
      continue
    }
    const slugs = collectSlugs(s)
    if (slugs.some((slug) => takenSlugs.has(slug) || RESERVED_SLUGS.has(slug))) {
      errors.push(`${label} sidecar "${s.id}" conflicts with a shipped or reserved slug — rejected`)
      continue
    }
    accepted.push(s)
    takenIds.add(s.id)
    for (const slug of slugs) takenSlugs.add(slug)
  }
  return accepted
}

export function discoverSidecars(opts?: DiscoverOptions): { sidecars: SidecarMeta[]; errors: string[] } {
  const shippedRoot = shippedSidecarsRoot(opts)
  const env = opts?.env || process.env
  const disabled = disabledAddonIds(env)
  const errors: string[] = []

  const core = scanRoot(join(shippedRoot, 'core'), 'shipped', 'core').map((s) => ({
    ...s,
    kind: 'core' as const,
    source: 'shipped' as const,
    disabled: false,
    editable: false,
  }))
  const addons = scanRoot(join(shippedRoot, 'addon'), 'shipped', 'addon', { disabledIds: disabled }).map((s) => ({
    ...s,
    kind: 'addon' as const,
    source: 'shipped' as const,
    disabled: disabled.has(s.id),
    editable: false,
  }))

  const takenIds = new Set(core.concat(addons).map((s) => s.id))
  const takenSlugs = new Set<string>()
  for (const s of core.concat(addons)) {
    for (const slug of collectSlugs(s)) takenSlugs.add(slug)
  }

  const customTree = scanCustomTree(customSidecarsRoot(opts))
  const custom = rejectConflicts(customTree.direct, takenIds, takenSlugs, errors, 'Custom')
  const cloned = rejectConflicts(customTree.cloned, takenIds, takenSlugs, errors, 'Git')

  return { sidecars: [...core, ...addons, ...custom, ...cloned], errors }
}

export function getSidecar(id: string, opts?: DiscoverOptions): SidecarMeta | undefined {
  return discoverSidecars(opts).sidecars.find((s) => s.id === id)
}

export function projectName(id: string) {
  return `bros-sc-${id}`
}

export function readSidecarFiles(id: string, opts?: DiscoverOptions): { sidecarYml: string; composeYml: string } {
  const sidecar = getSidecar(id, opts)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: `Sidecar "${id}" not found` })
  return {
    sidecarYml: readFileSync(join(sidecar.dir, 'sidecar.yml'), 'utf8'),
    composeYml: readFileSync(join(sidecar.dir, 'docker-compose.yml'), 'utf8'),
  }
}

function assertWritableAdditional(sidecar: SidecarMeta) {
  if (sidecar.kind === 'core' || sidecar.source === 'shipped') {
    throw createError({ statusCode: 400, statusMessage: `Shipped sidecar "${sidecar.id}" is not editable` })
  }
  if (!sidecar.editable) {
    throw createError({ statusCode: 400, statusMessage: `Sidecar "${sidecar.id}" is not editable in the UI` })
  }
}

export function writeCustomSidecar(input: {
  id: string
  sidecarYml: string
  composeYml: string
}, opts?: DiscoverOptions): SidecarMeta {
  const id = input.id.trim().toLowerCase()
  if (!SIDECAR_ID_RE.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'id must be a lowercase slug' })
  }
  if (isReservedSidecarId(id, opts)) {
    throw createError({ statusCode: 400, statusMessage: `Id "${id}" is reserved` })
  }
  const existing = getSidecar(id, opts)
  if (existing) {
    throw createError({ statusCode: 400, statusMessage: `Sidecar "${id}" already exists` })
  }

  let meta
  try {
    meta = sidecarMetaSchema.parse(parseYaml(input.sidecarYml))
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err instanceof Error ? err.message : 'Invalid sidecar.yml' })
  }
  if (meta.id !== id) {
    throw createError({ statusCode: 400, statusMessage: `sidecar.yml id "${meta.id}" must match "${id}"` })
  }
  try {
    parseYaml(input.composeYml)
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err instanceof Error ? err.message : 'Invalid docker-compose.yml' })
  }

  const dir = join(customSidecarsRoot(opts), id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'sidecar.yml'), input.sidecarYml.endsWith('\n') ? input.sidecarYml : `${input.sidecarYml}\n`)
  writeFileSync(join(dir, 'docker-compose.yml'), input.composeYml.endsWith('\n') ? input.composeYml : `${input.composeYml}\n`)

  const created = readSidecarDir(dir, 'custom', 'additional')
  if (!created) throw createError({ statusCode: 500, statusMessage: 'Failed to write sidecar' })
  if (created.error) throw createError({ statusCode: 400, statusMessage: created.error })
  return created
}

export function saveSidecarFiles(id: string, input: {
  sidecarYml: string
  composeYml: string
}, opts?: DiscoverOptions): { sidecar: SidecarMeta; composeChanged: boolean } {
  const sidecar = getSidecar(id, opts)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: `Sidecar "${id}" not found` })
  assertWritableAdditional(sidecar)

  let meta
  try {
    meta = sidecarMetaSchema.parse(parseYaml(input.sidecarYml))
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err instanceof Error ? err.message : 'Invalid sidecar.yml' })
  }
  if (meta.id !== id) {
    throw createError({ statusCode: 400, statusMessage: `sidecar.yml id cannot change from "${id}"` })
  }
  try {
    parseYaml(input.composeYml)
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err instanceof Error ? err.message : 'Invalid docker-compose.yml' })
  }

  const composePath = join(sidecar.dir, 'docker-compose.yml')
  const before = existsSync(composePath) ? readFileSync(composePath, 'utf8') : ''
  writeFileSync(join(sidecar.dir, 'sidecar.yml'), input.sidecarYml.endsWith('\n') ? input.sidecarYml : `${input.sidecarYml}\n`)
  writeFileSync(composePath, input.composeYml.endsWith('\n') ? input.composeYml : `${input.composeYml}\n`)
  const after = readFileSync(composePath, 'utf8')
  const updated = readSidecarDir(sidecar.dir, sidecar.source, sidecar.kind, { gitUrl: sidecar.gitUrl })
  if (!updated) throw createError({ statusCode: 500, statusMessage: 'Failed to save sidecar' })
  if (updated.error) throw createError({ statusCode: 400, statusMessage: updated.error })
  return { sidecar: updated, composeChanged: before !== after }
}

export function sidecarRepoNameFromUrl(url: string): string {
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

export async function cloneSidecarRepo(input: {
  url: string
  name?: string
}, opts?: DiscoverOptions): Promise<{ name: string; source: string; sidecars: SidecarMeta[] }> {
  const url = assertGitUrl(input.url)
  const name = (input.name?.trim() || sidecarRepoNameFromUrl(url)).toLowerCase()
  if (!SIDECAR_ID_RE.test(name)) {
    throw createError({ statusCode: 400, statusMessage: 'Repo folder name must be a lowercase slug' })
  }
  const customRoot = customSidecarsRoot(opts)
  mkdirSync(customRoot, { recursive: true })
  const dest = join(customRoot, name)
  if (existsSync(dest)) {
    throw createError({ statusCode: 400, statusMessage: `Repo folder "${name}" already exists` })
  }
  const result = await runGit(['clone', '--depth', '1', url, dest], customRoot)
  if (result.code !== 0) {
    throw createError({ statusCode: 400, statusMessage: result.stderr || 'git clone failed' })
  }
  const { sidecars, errors } = discoverSidecars(opts)
  const fromRepo = sidecars.filter((s) => s.gitUrl === url || (s.source === url) || s.dir.startsWith(join(dest, 'sidecars')))
  if (!fromRepo.length) {
    throw createError({
      statusCode: 400,
      statusMessage: errors[0] || `Clone succeeded but ${name}/sidecars/ has no valid sidecar packages`,
    })
  }
  return { name, source: url, sidecars: fromRepo }
}

function repoRootForSidecar(sidecar: SidecarMeta, opts?: DiscoverOptions): string | null {
  const base = customSidecarsRoot(opts)
  if (!sidecar.dir.startsWith(base)) return null
  const rel = sidecar.dir.slice(base.length).replace(/^[/\\]+/, '')
  const name = rel.split(/[/\\]/)[0]
  return name ? join(base, name) : null
}

export async function pullSidecarRepo(id: string, opts?: DiscoverOptions): Promise<{
  composeChanged: boolean
  source: string
}> {
  const sidecar = getSidecar(id, opts)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: `Sidecar "${id}" not found` })
  const repoRoot = repoRootForSidecar(sidecar, opts)
  if (!repoRoot) {
    throw createError({ statusCode: 400, statusMessage: `Sidecar "${id}" is not from a git repo` })
  }
  const composePath = join(sidecar.dir, 'docker-compose.yml')
  const before = existsSync(composePath) ? readFileSync(composePath, 'utf8') : ''
  const result = await runGit(['pull', '--ff-only'], repoRoot)
  if (result.code !== 0) {
    throw createError({ statusCode: 400, statusMessage: result.stderr || 'git pull failed' })
  }
  const after = existsSync(composePath) ? readFileSync(composePath, 'utf8') : ''
  return { composeChanged: before !== after, source: sidecar.source }
}
