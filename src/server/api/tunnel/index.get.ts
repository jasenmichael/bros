import { getRequestHost } from 'h3'
import { loadBootstrapConfig } from '../../utils/config'
import { readTunnelStatus, tunnelPublicPayload } from '../../utils/tunnel'
import { advertisedTunnelHost, tunnelHostname, viaTunnelFromEvent } from '../../utils/viaTunnel'

export default defineEventHandler((event) => {
  const cfg = loadBootstrapConfig()
  const status = readTunnelStatus(cfg.dataDir)
  const configuredHost = advertisedTunnelHost({
    publicUrl: cfg.publicUrl,
    lastHostname: status.hostname,
  })
  const viaTunnel = viaTunnelFromEvent(event, {
    publicUrl: cfg.publicUrl,
    lastHostname: status.hostname,
  })
  return {
    viaTunnel,
    tunnelHost: tunnelHostname({
      viaTunnel,
      host: getRequestHost(event),
      tunnelHost: configuredHost,
    }),
    tunnel: tunnelPublicPayload(status, cfg.publicUrl),
  }
})
