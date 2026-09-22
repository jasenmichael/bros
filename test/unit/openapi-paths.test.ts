import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')
const apiRoot = join(root, 'src/server/api')
const yamlPath = join(root, 'docs/api/openapi.yaml')

const METHOD_EXT: Record<string, string> = {
  get: 'get',
  post: 'post',
  patch: 'patch',
  put: 'put',
  delete: 'delete',
}

function walk(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, rel))
      continue
    }
    if (name.endsWith('.ts')) out.push(rel)
  }
  return out
}

function nitroOp(rel: string): { method: string; path: string } | null {
  if (rel.startsWith('models/') || rel.startsWith('models\\')) return null
  const match = rel.match(/^(.*)\.(get|post|patch|put|delete)\.ts$/)
  if (!match) return null
  const [, filePath, method] = match
  const segments = filePath.split('/').map((seg) => {
    if (seg === 'index') return null
    if (seg.startsWith('[') && seg.endsWith(']')) return `{${seg.slice(1, -1)}}`
    return seg
  }).filter((seg): seg is string => Boolean(seg))
  return { method: METHOD_EXT[method], path: `/api/${segments.join('/')}` }
}

function openApiOps(yaml: string): Set<string> {
  const ops = new Set<string>()
  let currentPath = ''
  for (const line of yaml.split('\n')) {
    const pathMatch = line.match(/^  (\/[a-zA-Z0-9_{}/.-]+):$/)
    if (pathMatch) {
      currentPath = pathMatch[1]
      continue
    }
    const methodMatch = line.match(/^    (get|post|patch|put|delete):$/)
    if (methodMatch && currentPath) {
      ops.add(`${methodMatch[1].toUpperCase()} ${currentPath}`)
    }
  }
  return ops
}

describe('OpenAPI covers Nitro routes', () => {
  it('lists every src/server/api handler except /api/models 301 shims', () => {
    const yaml = readFileSync(yamlPath, 'utf8')
    const documented = openApiOps(yaml)
    const nitro = walk(apiRoot)
      .map(nitroOp)
      .filter((op): op is { method: string; path: string } => Boolean(op))
      .map((op) => `${op.method.toUpperCase()} ${op.path}`)
      .sort()

    const missing = nitro.filter((op) => !documented.has(op))
    const extra = [...documented].filter((op) => {
      if (op === 'GET /openapi.yaml') return false
      return !nitro.includes(op)
    })
    expect(missing, `missing from OpenAPI: ${missing.join(', ')}`).toEqual([])
    expect(extra, `OpenAPI extras not in Nitro: ${extra.join(', ')}`).toEqual([])
    expect(documented.has('GET /openapi.yaml')).toBe(true)
  })
})
