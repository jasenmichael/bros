import { eq } from 'drizzle-orm'
import { getDb, meta } from './db'

export type McpServer = {
  id: string
  url: string
  enabled: boolean
}

const META_KEY = 'mcp_servers'

export function listMcpServers(): McpServer[] {
  const row = getDb().select().from(meta).where(eq(meta.key, META_KEY)).get()
  if (!row) return []
  try {
    const parsed = JSON.parse(row.value) as McpServer[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s) => s && typeof s.id === 'string' && typeof s.url === 'string')
  } catch {
    return []
  }
}

function save(servers: McpServer[]) {
  const db = getDb()
  const value = JSON.stringify(servers)
  const existing = db.select().from(meta).where(eq(meta.key, META_KEY)).get()
  if (existing) db.update(meta).set({ value }).where(eq(meta.key, META_KEY)).run()
  else db.insert(meta).values({ key: META_KEY, value }).run()
}

export function upsertMcpServer(input: { id: string; url: string; enabled?: boolean }) {
  const id = input.id.trim()
  const url = input.url.trim()
  if (!id || !url) throw createError({ statusCode: 400, statusMessage: 'id and url required' })
  const servers = listMcpServers().filter((s) => s.id !== id)
  servers.push({ id, url, enabled: input.enabled !== false })
  save(servers)
  return servers
}

export function setMcpEnabled(id: string, enabled: boolean) {
  const servers = listMcpServers()
  const row = servers.find((s) => s.id === id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'MCP server not found' })
  row.enabled = enabled
  save(servers)
  return servers
}

export function deleteMcpServer(id: string) {
  save(listMcpServers().filter((s) => s.id !== id))
}
