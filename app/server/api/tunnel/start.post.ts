import { loadBootstrapConfig } from '../../utils/config'
import {
  readTunnelStatus,
  tunnelPublicPayload,
  waitForTunnelState,
  writeTunnelCommand,
} from '../../utils/tunnel'
import { applyTunnelPower, viaTunnelFromEvent } from '../../utils/viaTunnel'

export default defineEventHandler(async (event) => {
  const cfg = loadBootstrapConfig()
  const dataDir = cfg.dataDir
  const before = readTunnelStatus(dataDir)
  const viaTunnel = viaTunnelFromEvent(event, {
    publicUrl: cfg.publicUrl,
    lastHostname: before.hostname,
  })
  const result = await applyTunnelPower(true, {
    viaTunnel,
    running: before.running,
    start: async () => {
      if (!before.helperAlive) {
        throw createError({
          statusCode: 503,
          statusMessage: 'Tunnel helper is not running. Start Bros with ./bros so the host can spawn cloudflared.',
        })
      }
      writeTunnelCommand(dataDir, 'start')
      const after = await waitForTunnelState(dataDir, true)
      if (!after.running) {
        throw createError({
          statusCode: 500,
          statusMessage: after.error || 'Tunnel did not start. Check host cloudflared install and login.',
        })
      }
    },
    stop: async () => {},
  })
  if (!result.ok) {
    throw createError({ statusCode: 403, statusMessage: result.error })
  }
  return { ok: true, tunnel: tunnelPublicPayload(readTunnelStatus(dataDir), cfg.publicUrl) }
})
