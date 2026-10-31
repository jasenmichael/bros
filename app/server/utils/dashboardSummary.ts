import { getRequestHost, type H3Event } from 'h3'
import { getDiskSpace } from './disk'
import { autostartFailure, pingDocker, dockerAppPhase, dockerAppRuntime } from './docker'
import { formatSizeBytes } from './providers/ollamaLibrary'
import { discoverDockerApps, type DockerAppMeta } from './docker-app/dockerApps'
import { loadBootstrapConfig } from './config'
import { readTunnelStatus, tunnelPublicPayload } from './tunnel'
import { advertisedTunnelHost, tunnelHostname, viaTunnelFromEvent } from './viaTunnel'
import { listConversations } from './chat/chat'
import { ensureDefaultProviders, listProviders, OLLAMA_HOST_ID, OLLAMA_DOCKER_APP_ID } from './providers'
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
    if (id === OLLAMA_DOCKER_APP_ID) return 0
    if (id === OLLAMA_HOST_ID) return 1
    return 2
  }
  const items = rows
    .filter((row) => {
      if (row.id === OLLAMA_HOST_ID) return opts.hostEnabled
      if (row.id === OLLAMA_DOCKER_APP_ID) return true
      return row.enabled
    })
    .map((row) => {
      if (row.id === OLLAMA_DOCKER_APP_ID) {
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
    if (item.id === OLLAMA_DOCKER_APP_ID) return opts.ollamaPhase === 'running'
    return true
  }).length

  return { ready, items }
}

export function buildAttention(input: {
  dockerOk: boolean
  dockerError: string | null
  dockerApps: Array<{ id: string; name: string; phase: DashboardPhase; error: string | null }>
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
  for (const dockerApp of input.dockerApps) {
    if (dockerApp.id !== 'ollama' && dockerApp.id !== 'whisper') continue
    if (dockerApp.phase !== 'error') continue
    items.push({
      id: `dockerApp:${dockerApp.id}`,
      text: dockerApp.error ? `${dockerApp.name}: ${dockerApp.error}` : `${dockerApp.name} is in error`,
      href: '/settings/desktop/apps',
    })
  }
  if (input.ollamaPhase === 'stopped') {
    items.push({
      id: 'ollama',
      text: 'Ollama is stopped',
      href: '/settings/desktop/apps',
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
      href: '/settings/providers',
    })
  }
  return items
}

async function dockerAppState(dockerApp: DockerAppMeta): Promise<{ phase: DashboardPhase; error: string | null }> {
  try {
    const runtime = await dockerAppRuntime(dockerApp)
    const problem = dockerApp.error
      || (runtime.status.running ? null : (runtime.warning || autostartFailure(dockerApp.id) || null))
    const phase = dockerAppPhase(dockerApp.id, runtime.status.running, problem || undefined)
    return { phase, error: phase === 'error' ? (problem || 'error') : null }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'status failed'
    return { phase: dockerAppPhase(dockerApp.id, false, message), error: message }
  }
}

function dockerAppRank(dockerApp: { id: string; kind: string }) {
  if (dockerApp.id === 'ollama') return 0
  if (dockerApp.id === 'whisper') return 1
  if (dockerApp.kind === 'core') return 2
  return 3
}

export async function getDashboardSummary(event: H3Event) {
  const docker = await pingDocker()
  const disk = getDiskSpace()
  const { dockerApps } = discoverDockerApps()
  const visible = dockerApps.filter((dockerApp) => !dockerApp.disabled)
  const states = new Map<string, { phase: DashboardPhase; error: string | null }>()
  await Promise.all(visible.map(async (dockerApp) => {
    states.set(dockerApp.id, await dockerAppState(dockerApp))
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
  const ollamaPhase = states.get(OLLAMA_DOCKER_APP_ID)?.phase ?? null
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

  const dockerAppItems = visible
    .map((dockerApp) => {
      const state = states.get(dockerApp.id) ?? { phase: 'stopped' as const, error: null }
      return {
        id: dockerApp.id,
        name: dockerApp.name,
        kind: dockerApp.kind,
        phase: state.phase,
        error: state.error,
        openUrl: webuiOpenUrl(dockerApp.interfaces, viaTunnel),
      }
    })
    .sort((a, b) => dockerAppRank(a) - dockerAppRank(b) || a.name.localeCompare(b.name))

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
      dockerApps: dockerAppItems,
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
    dockerApps: {
      running: dockerAppItems.filter((item) => item.phase === 'running').length,
      total: dockerAppItems.length,
      items: dockerAppItems.map(({ id, name, phase, openUrl }) => ({ id, name, phase, openUrl })),
    },
    tunnel: tunnelPublicPayload(tunnel, cfg.publicUrl),
  }
}
