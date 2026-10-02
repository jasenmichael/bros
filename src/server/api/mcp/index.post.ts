import { upsertMcpServer } from '../../utils/mcpClient'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: string; url?: string; enabled?: boolean }>(event)
  if (!body?.id || !body.url) throw createError({ statusCode: 400, statusMessage: 'id and url required' })
  return { servers: upsertMcpServer({ id: body.id, url: body.url, enabled: body.enabled }) }
})
