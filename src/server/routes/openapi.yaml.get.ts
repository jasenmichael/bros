import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function resolveOpenApiYaml() {
  const home = process.env.BROS_WORKING_DIR || process.env.BROS_DIR || ''
  const candidates = [
    home ? join(home, 'docs/api/openapi.yaml') : '',
    join(process.cwd(), 'docs/api/openapi.yaml'),
    join(process.cwd(), '../docs/api/openapi.yaml'),
    join(process.cwd(), '../../docs/api/openapi.yaml'),
  ].filter(Boolean)
  const hit = candidates.find((p) => existsSync(p))
  if (!hit) {
    throw createError({ statusCode: 500, statusMessage: 'OpenAPI spec not found' })
  }
  return hit
}

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'application/yaml; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  return readFileSync(resolveOpenApiYaml(), 'utf8')
})
