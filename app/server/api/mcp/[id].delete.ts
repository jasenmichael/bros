import { deleteMcpServer, listMcpServers } from '../../utils/mcpClient'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  deleteMcpServer(id)
  return { servers: listMcpServers() }
})