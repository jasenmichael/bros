import { getRequestHost, type H3Event } from 'h3'
import { getDiskSpace } from './disk'
import { pingDocker, sidecarPhase, sidecarRuntime } from './docker'
import { formatSizeBytes } from './providers/ollamaLibrary'
import { discoverSidecars, type SidecarMeta } from './sidecars/sidecars'
import { loadBootstrapConfig } from './config'
import { readTunnelStatus, tunnelPublicPayload } from './tunnel'
import { advertisedTunnelHost, tunnelHostname, viaTunnelFromEvent } from './viaTunnel'
import { listConversations } from './chat/chat'
import { ensureDefaultProviders, listProviders, OLLAMA_HOST_ID, OLLAMA_SIDECAR_ID } from './providers'
import { isHostOllamaEnabled } from './settings'
import { listActivePullsByProvider } from './providers/ollamaPullJobs'

export type DashboardPhase = 'starting' | 'running' | 'stopped' | 'error'

export type AttentionItem = {
  id: string
  text: string
  href: string
}

export type DashboardProviderItem = {
  id: string
  name: string
  chatOn: boolean
  detail: string
}

export type DashboardPull = {
  providerId: string
  model: string
  phase: 'queued' | 'running'
  percent: number | null
}

const LOW_DISK_BYTES = 2 * 1024 * 1024 * 1024
const CHAT_LIMIT = 8

export function diskNeedsAttention(freeBytes: number | null, totalBytes: number | null): boolean {
  if (freeBytes == null || !Number.isFinite(freeBytes)) return false
  if (freeBytes < LOW_DISK_BYTES) return true
  if (totalBytes && totalBytes > 0 && freeBytes / totalBytes < 0.1) return true
  return false
}

export function webuiOpenUrl(
  interfaces: Array<{ type: string; publish?: number; basePath?: string }>,
  viaTunnel: boolean,
): string | null {
  if (viaTunnel) return null
  const webui = interfaces.find((iface) => iface.type === 'webui' && typeof iface.publish === 'number')
  if (!webui?.publish) return null
  const origin = `http://127.0.0.1:${webui.publish}/`
  const basePath = webui.basePath?.trim()
  if (!basePath) return origin
  const path = basePath.startsWith('/') ? basePath : `/${basePath}`
  return `${origin.replace(/\/$/, '')}${path}`
}

export function selectDashboardProviders(
  rows: Array<{ id: string; name: string; enabled: boolean }>,
  opts: { hostEnabled: boolean; ollamaPhase: DashboardPhase | null },
): { ready: number; items: DashboardProviderItem[] } {
  const rank = (id: string) => {
    if (id === OLLAMA_SIDECAR_ID) return 0
    if (id === OLLAMA_HOST_ID) return 1
    return 2
  }
  const items = rows
    .filter((row) => {
      if (row.id === OLLAMA_HOST_ID) return opts.hostEnabled
      if (row.id === OLLAMA_SIDECAR_ID) return true
      return row.enabled
    })
    .map((row) => {
      if (row.id === OLLAMA_SIDECAR_ID) {
        const phase = opts.ollamaPhase ?? 'stopped'
        return {
          id: row.id,
          name: row.name,
          chatOn: row.enabled,
          detail: row.enabled ? phase : `${phase} · Chat off`,
        }
      }
      return {
        id: row.id,
        name: row.name,
        chatOn: row.enabled,
        detail: row.enabled ? 'Chat on' : 'Chat off',
      }
    })
    .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))

  const ready = items.filter((item) => {
    if (!item.chatOn) return false
    if (item.id === OLLAMA_SIDECAR_ID) return opts.ollamaPhase === 'running'
    return true
  }).length

  return { ready, items }
}

export function buildAttention(input: {
  dockerOk: boolean
  dockerError: string | null
  sidecars: Array<{ id: string; name: string; phase: DashboardPhase; error: string | null }>
  diskFreeBytes: number | null
  diskTotalBytes: number | null
  diskFreeLabel: string | null
  chatReady: number
  ollamaPhase: DashboardPhase | null
}): AttentionItem[] {
  const items: AttentionItem[] = []
  if (!input.dockerOk) {
    items.push({
      id: 'docker',
      text: input.dockerError || 'Docker socket is unreachable',
      href: '/status',
    })
  }
  for (const sidecar of input.sidecars) {
    if (sidecar.phase !== 'error') continue
    items.push({
      id: `sidecar:${sidecar.id}`,
      text: sidecar.error ? `${sidecar.name}: ${sidecar.error}` : `${sidecar.name} is in error`,
      href: '/sidecars',
    })
  }
  if (input.ollamaPhase === 'stopped') {
    items.push({
      id: 'ollama',
      text: 'Ollama is stopped',
      href: '/sidecars',
    })
  }
  if (diskNeedsAttention(input.diskFreeBytes, input.diskTotalBytes)) {
    items.push({
      id: 'disk',
      text: input.diskFreeLabel ? `${input.diskFreeLabel} free on the data disk` : 'Data disk is low',
      href: '/status',
    })
  }
  if (input.chatReady === 0 && input.ollamaPhase === 'running') {
    items.push({
      id: 'chat',
      text: 'No provider is on for chat',
      href: '/providers',
    })
  }
  return items
}

async function sidecarState(sidecar: SidecarMeta): Promise<{ phase: DashboardPhase; error: string | null }> {
  try {
    const runtime = await sidecarRuntime(sidecar)
    const problem = sidecar.error || (!runtime.status.running ? runtime.warning : undefined) || null
    const phase = sidecarPhase(sidecar.id, runtime.status.running, problem || undefined)
    return { phase, error: phase === 'error' ? (problem || 'error') : null }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'status failed'
    return { phase: sidecarPhase(sidecar.id, false, message), error: message }
  }
}

function sidecarRank(sidecar: { id: string; kind: string }) {
  if (sidecar.id === 'ollama') return 0
  if (sidecar.id === 'whisper') return 1
  if (sidecar.kind === 'core') return 2
  return 3
}

export async function getDashboardSummary(event: H3Event) {
  const docker = await pingDocker()
  const disk = getDiskSpace()
  const { sidecars } = discoverSidecars()
  const visible = sidecars.filter((sidecar) => !sidecar.disabled)
  const states = new Map<string, { phase: DashboardPhase; error: string | null }>()
  await Promise.all(visible.map(async (sidecar) => {
    states.set(sidecar.id, await sidecarState(sidecar))
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

  ensureDefaultProviders()
  const hostEnabled = isHostOllamaEnabled()
  const ollamaPhase = states.get(OLLAMA_SIDECAR_ID)?.phase ?? null
  const providerRows = listProviders()
    .filter((row) => row.id !== OLLAMA_HOST_ID || hostEnabled)
    .map((row) => ({ id: row.id, name: row.name, enabled: row.enabled }))
  const providers = selectDashboardProviders(providerRows, { hostEnabled, ollamaPhase })
  const names = new Map(providerRows.map((row) => [row.id, row.name]))
  const pulls: DashboardPull[] = []
  for (const jobs of Object.values(listActivePullsByProvider())) {
    for (const job of jobs) {
      if (job.phase !== 'queued' && job.phase !== 'running') continue
      pulls.push({
        providerId: job.providerId,
        model: job.model,
        phase: job.phase,
        percent: job.percent,
      })
    }
  }
  pulls.sort((a, b) => (names.get(a.providerId) || a.providerId).localeCompare(names.get(b.providerId) || b.providerId) || a.model.localeCompare(b.model))

  const sidecarItems = visible
    .map((sidecar) => {
      const state = states.get(sidecar.id) ?? { phase: 'stopped' as const, error: null }
      return {
        id: sidecar.id,
        name: sidecar.name,
        kind: sidecar.kind,
        phase: state.phase,
        error: state.error,
        openUrl: webuiOpenUrl(sidecar.interfaces, viaTunnel),
      }
    })
    .sort((a, b) => sidecarRank(a) - sidecarRank(b) || a.name.localeCompare(b.name))

  const freeBytes = Number.isFinite(disk.freeBytes) ? disk.freeBytes : null
  const totalBytes = disk.totalBytes || null

  return {
    viaTunnel,
    tunnelHost: tunnelHostname({
      viaTunnel,
      host: getRequestHost(event),
      tunnelHost: configuredHost,
    }),
    attention: buildAttention({
      dockerOk: docker.ok,
      dockerError: docker.error ?? null,
      sidecars: sidecarItems,
      diskFreeBytes: freeBytes,
      diskTotalBytes: totalBytes,
      diskFreeLabel: freeBytes != null ? (formatSizeBytes(freeBytes) ?? null) : null,
      chatReady: providers.ready,
      ollamaPhase,
    }),
    chats: listConversations().slice(0, CHAT_LIMIT).map((chat) => ({
      id: chat.id,
      title: chat.title,
      modelId: chat.modelId,
      updatedAt: chat.updatedAt,
    })),
    providers: {
      ready: providers.ready,
      items: providers.items,
      pulls,
    },
    sidecars: {
      running: sidecarItems.filter((item) => item.phase === 'running').length,
      total: sidecarItems.length,
      items: sidecarItems.map(({ id, name, phase, openUrl }) => ({ id, name, phase, openUrl })),
    },
    tunnel: tunnelPublicPayload(tunnel, cfg.publicUrl),
  }
}
