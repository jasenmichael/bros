import { listMcpServers } from '../../utils/mcpClient'

export default defineEventHandler(() => ({ servers: listMcpServers() }))
