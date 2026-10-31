import { loadBootstrapConfig } from '../../utils/config'
import {
  readTunnelStatus,
  tunnelPublicPayload,
  waitForTunnelState,
  writeTunnelCommand,
} from '../../utils/tunnel'
import { applyTunnelPower, TUNNEL_STOP_LOCKED_MESSAGE, viaTunnelFromEvent } from '../../utils/viaTunnel'

export default defineEventHandler(async (event) => {
  const cfg = loadBootstrapConfig()
  const dataDir = cfg.dataDir
  const before = readTunnelStatus(dataDir)
  const viaTunnel = viaTunnelFromEvent(event, {
    publicUrl: cfg.publicUrl,
    lastHostname: before.hostname,
  })
  const result = await applyTunnelPower(false, {
    viaTunnel,
    running: before.running,
    start: async () => {},
    stop: async () => {
      writeTunnelCommand(dataDir, 'stop')
      const after = await waitForTunnelState(dataDir, false)
      if (after.running) {
        throw createError({
          statusCode: 500,
          statusMessage: after.error || 'Tunnel did not stop.',
        })
      }
    },
  })
  if (!result.ok) {
    throw createError({ statusCode: 403, statusMessage: result.error || TUNNEL_STOP_LOCKED_MESSAGE })
  }
  return { ok: true, tunnel: tunnelPublicPayload(readTunnelStatus(dataDir), cfg.publicUrl) }
})
