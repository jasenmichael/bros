import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'pathe'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { loadBootstrapConfig } from './config'

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
}).superRefine((val, ctx) => {
  if (val.type !== 'cli' && !val.service) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'service required', path: ['service'] })
  }
  if ((val.type === 'webui' || val.type === 'api' || val.type === 'openai') && !val.containerPort) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'containerPort required', path: ['containerPort'] })
  }
  if (val.type === 'webui' && !val.publish) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'webui requires publish (no path proxy)', path: ['publish'] })
  }
  if (val.publish === 3000 || val.publish === 8080) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'publish must not be 3000 or 8080', path: ['publish'] })
  }
})

const hostProbeSchema = z.object({
  ports: z.array(z.number().int().positive()).min(1),
  path: z.string().min(1).default('/api/version'),
}).optional()

const sidecarMetaSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  slug: z.string().regex(/^[a-z][a-z0-9_-]*$/).optional(),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  hostProbe: hostProbeSchema,
  interfaces: z.array(interfaceSchema).default([]),
})

export function parseSidecarMeta(raw: unknown) {
  return sidecarMetaSchema.parse(raw)
}

export type SidecarInterface = z.infer<typeof interfaceSchema>
export type SidecarMeta = z.infer<typeof sidecarMetaSchema> & {
  source: 'core' | 'custom'
  dir: string
  packageSlug: string
  error?: string
}

export const RESERVED_SLUGS = new Set([
  'api', 'chat', 'models', 'sidecars', 'settings', 'docs',
  'login', 'setup', 'status', '_nuxt', 'favicon.ico',
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
      if (iface.type === 'webui' && !iface.containerPort) {
        return { ...meta, source, dir, packageSlug, error: 'webui interface requires containerPort' }
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

export function projectName(id: string) {
  return `bros-sc-${id}`
}
