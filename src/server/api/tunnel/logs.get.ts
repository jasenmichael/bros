import { loadBootstrapConfig } from '../../utils/config'
import { readTunnelLogs } from '../../utils/tunnel'

export default defineEventHandler((event) => {
  const tail = Number(getQuery(event).tail) || 80
  return { logs: readTunnelLogs(loadBootstrapConfig().dataDir, tail) }
})
