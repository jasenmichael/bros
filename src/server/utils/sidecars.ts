import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'pathe'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { loadBootstrapConfig } from './config'

const interfaceSchema = z.object({
  type: z.enum(['webui', 'api', 'openai', 'cli']),
  service: z.string().min(1).optional(),
  targetPort: z.number().int().positive().optional(),
  /** When set, Open/Pin use host:port (needed for apps that cannot run under a path prefix). */
  hostPort: z.number().int().positive().optional(),
  slug: z.string().regex(/^[a-z][a-z0-9_-]*$/).optional(),
  basePath: z.string().optional(),
  command: z.string().optional(),
}).superRefine((val, ctx) => {
  if (val.type !== 'cli' && !val.service) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'service required', path: ['service'] })
  }
  if ((val.type === 'webui' || val.type === 'api' || val.type === 'openai') && !val.targetPort) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'targetPort required', path: ['targetPort'] })
  }
})

const sidecarMetaSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  slug: z.string().regex(/^[a-z][a-z0-9_-]*$/).optional(),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  interfaces: z.array(interfaceSchema).default([]),
})

export type SidecarInterface = z.infer<typeof interfaceSchema>
export type SidecarMeta = z.infer<typeof sidecarMetaSchema> & {
  source: 'core' | 'custom'
  dir: string
  packageSlug: string
  error?: string
}

export const RESERVED_SLUGS = new Set([
  'api', 'chat', 'models', 'sidecars', 'settings', 'docs',
  'login', 'setup', '_nuxt', 'favicon.ico',
])

function readSidecarDir(dir: string, source: 'core' | 'custom'): SidecarMeta | null {
  const metaPath = join(dir, 'sidecar.yml')
  const composePath = join(dir, 'docker-compose.yml')
  if (!existsSync(metaPath) || !existsSync(composePath)) return null

  try {
    const raw = parseYaml(readFileSync(metaPath, 'utf8'))
    const meta = sidecarMetaSchema.parse(raw)
    const idFromDir = dir.split(/[/\\]/).filter(Boolean).pop()
    if (idFromDir !== meta.id) {
      return {
        ...meta,
        source,
        dir,
        packageSlug: meta.slug || meta.id,
        error: `Directory name "${idFromDir}" must match id "${meta.id}"`,
      }
    }
    parseYaml(readFileSync(composePath, 'utf8'))
    const packageSlug = meta.slug || meta.id
    if (RESERVED_SLUGS.has(packageSlug)) {
      return { ...meta, source, dir, packageSlug, error: `Slug "${packageSlug}" is reserved` }
    }
    for (const iface of meta.interfaces) {
      if (iface.type === 'webui' && !iface.targetPort) {
        return { ...meta, source, dir, packageSlug, error: 'webui interface requires targetPort' }
      }
      const slug = iface.slug || packageSlug
      if (RESERVED_SLUGS.has(slug)) {
        return { ...meta, source, dir, packageSlug, error: `Interface slug "${slug}" is reserved` }
      }
    }
    return { ...meta, source, dir, packageSlug }
  } catch (err) {
    const id = dir.split(/[/\\]/).filter(Boolean).pop() || 'unknown'
    return {
      id,
      name: id,
      description: '',
      interfaces: [],
      source,
      dir,
      packageSlug: id,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function scanRoot(root: string, source: 'core' | 'custom'): SidecarMeta[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readSidecarDir(join(root, d.name), source))
    .filter((x): x is SidecarMeta => Boolean(x))
}

export function discoverSidecars(): { sidecars: SidecarMeta[]; errors: string[] } {
  const { workingDir, dataDir } = loadBootstrapConfig()
  const core = scanRoot(join(workingDir, 'sidecars'), 'core')
  const custom = scanRoot(join(dataDir, 'sidecars'), 'custom')
  const errors: string[] = []
  const coreIds = new Set(core.map((s) => s.id))
  const coreSlugs = new Set<string>()
  for (const s of core) {
    coreSlugs.add(s.packageSlug)
    for (const iface of s.interfaces) {
      if (iface.type === 'webui') coreSlugs.add(iface.slug || s.packageSlug)
    }
  }

  const acceptedCustom: SidecarMeta[] = []
  for (const s of custom) {
    if (coreIds.has(s.id)) {
      errors.push(`Custom sidecar "${s.id}" conflicts with core id — rejected`)
      continue
    }
    const slugs = [
      s.packageSlug,
      ...s.interfaces.filter((i) => i.type === 'webui').map((i) => i.slug || s.packageSlug),
    ]
    if (slugs.some((slug) => coreSlugs.has(slug))) {
      errors.push(`Custom sidecar "${s.id}" conflicts with core slug — rejected`)
      continue
    }
    acceptedCustom.push(s)
  }

  return { sidecars: [...core, ...acceptedCustom], errors }
}

export function getSidecar(id: string): SidecarMeta | undefined {
  return discoverSidecars().sidecars.find((s) => s.id === id)
}

export function resolveWebUiTargets() {
  const out: Array<{ slug: string; service: string; port: number; sidecarId: string; hostPort?: number }> = []
  const used = new Set<string>()
  for (const s of discoverSidecars().sidecars) {
    if (s.error) continue
    const webuis = s.interfaces.filter((i) => i.type === 'webui')
    webuis.forEach((iface, idx) => {
      let slug = iface.slug || (webuis.length === 1 ? s.packageSlug : `${s.packageSlug}-${idx + 1}`)
      if (used.has(slug)) slug = `${slug}-${idx + 1}`
      used.add(slug)
      out.push({
        slug,
        service: iface.service!,
        port: iface.targetPort!,
        sidecarId: s.id,
        hostPort: iface.hostPort,
      })
    })
  }
  return out
}

export function projectName(id: string) {
  return `bros-sc-${id}`
}
