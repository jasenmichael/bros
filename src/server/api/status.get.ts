import { getRequestHost } from 'h3'
import { getDiskSpace } from '../utils/disk'
import { pingDocker, projectHasContainers, sidecarRuntime } from '../utils/docker'
import { detectGpuCached } from '../utils/gpu'
import { formatSizeBytes } from '../utils/ollamaLibrary'
import { discoverSidecars } from '../utils/sidecars'
import { loadBootstrapConfig } from '../utils/config'
import { readTunnelStatus, tunnelPublicPayload } from '../utils/tunnel'
import { advertisedTunnelHost, tunnelHostname, viaTunnelFromEvent } from '../utils/viaTunnel'

export default defineEventHandler(async (event) => {
  const docker = await pingDocker()
  const disk = getDiskSpace()
  const gpu = await detectGpuCached()
  const { sidecars, errors } = discoverSidecars()
  const items = await Promise.all(sidecars.map(async (s) => {
    const runtime = await sidecarRuntime(s)
    let hasContainer = false
    try {
      hasContainer = await projectHasContainers(s.id)
    } catch {
      hasContainer = runtime.status.running
    }
    return {
      id: s.id,
      name: s.name,
      source: s.source,
      error: s.error,
      hostPort: runtime.hostPort,
      hostMode: runtime.settings.hostMode,
      effectiveMode: runtime.effectiveMode,
      hostManaged: runtime.hostManaged,
      portOccupied: runtime.portOccupied,
      warning: runtime.warning,
      hostOllama: runtime.hostOllama,
      hostOllamaError: runtime.hostOllamaError,
      autostart: runtime.settings.autostart,
      navPinned: runtime.settings.navPinned,
      running: runtime.status.running,
      services: runtime.status.services,
      hasContainer,
    }
  }))
  const cfg = loadBootstrapConfig()
  const tunnel = readTunnelStatus(cfg.dataDir)
  const configuredHost = advertisedTunnelHost({
    publicUrl: cfg.publicUrl,
    lastHostname: tunnel.hostname,
  })
  const viaTunnel = viaTunnelFromEvent(event, {
    publicUrl: cfg.publicUrl,
    lastHostname: tunnel.hostname,
  })
  return {
    viaTunnel,
    tunnelHost: tunnelHostname({
      viaTunnel,
      host: getRequestHost(event),
      tunnelHost: configuredHost,
    }),
    tunnel: tunnelPublicPayload(tunnel, cfg.publicUrl),
    app: {
      ok: true,
      service: 'bros',
      port: Number(process.env.BROS_PORT || process.env.PORT || 3055),
    },
    docker,
    disk: {
      path: disk.path,
      freeBytes: Number.isFinite(disk.freeBytes) ? disk.freeBytes : null,
      totalBytes: disk.totalBytes || null,
      freeLabel: Number.isFinite(disk.freeBytes) ? formatSizeBytes(disk.freeBytes) : null,
      totalLabel: disk.totalBytes ? formatSizeBytes(disk.totalBytes) : null,
    },
    gpu,
    sidecars: items,
    errors,
  }
})
