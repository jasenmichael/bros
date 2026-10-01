import { getRequestHost } from 'h3'
import { getDiskSpace } from '../utils/disk'
import { listBrosManagedContainers, pingDocker, projectHasContainers, sidecarPhase, sidecarRuntime } from '../utils/docker'
import { detectGpuCached } from '../utils/gpu'
import { formatSizeBytes } from '../utils/providers/ollamaLibrary'
import { discoverSidecars } from '../utils/sidecars/sidecars'
import { loadBootstrapConfig } from '../utils/config'
import { readTunnelStatus, tunnelPublicPayload } from '../utils/tunnel'
import { peekOllamaRestartNotice } from '../utils/sidecars/ollamaMustRun'
import { isHostOllamaEnabled } from '../utils/settings'
import { advertisedTunnelHost, tunnelHostname, viaTunnelFromEvent } from '../utils/viaTunnel'

export default defineEventHandler(async (event) => {
  const docker = await pingDocker()
  const disk = getDiskSpace()
  const gpu = await detectGpuCached()
  const containers = await listBrosManagedContainers()
  const { sidecars, errors } = discoverSidecars()
  const items = await Promise.all(sidecars.map(async (s) => {
    try {
      const runtime = await sidecarRuntime(s)
      let hasContainer = false
      try {
        hasContainer = await projectHasContainers(s.id)
      } catch {
        hasContainer = runtime.status.running
      }
      const problem = s.error || (!runtime.status.running ? runtime.warning : undefined)
      return {
        id: s.id,
        name: s.name,
        source: s.source,
        kind: s.kind,
        disabled: s.disabled,
        error: s.error,
        hostPort: runtime.hostPort,
        portOccupied: runtime.portOccupied,
        warning: runtime.warning,
        hostOllama: runtime.hostOllama,
        hostOllamaError: runtime.hostOllamaError,
        autostart: runtime.settings.autostart,
        navPinned: runtime.settings.navPinned,
        running: runtime.status.running,
        services: runtime.status.services,
        hasContainer,
        phase: sidecarPhase(s.id, runtime.status.running, problem),
      }
    }
    catch (err) {
      return {
        id: s.id,
        name: s.name,
        source: s.source,
        kind: s.kind,
        disabled: s.disabled,
        error: err instanceof Error ? err.message : 'status failed',
        running: false,
        hasContainer: false,
        services: [],
        phase: sidecarPhase(s.id, false, err instanceof Error ? err.message : 'status failed'),
      }
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
    containers,
    enableHostOllama: isHostOllamaEnabled(),
    sidecars: items,
    errors,
    ollamaRestartNotice: peekOllamaRestartNotice(),
  }
})
