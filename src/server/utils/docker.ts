import { spawn } from 'node:child_process'
import { join } from 'node:path'
import Docker from 'dockerode'
import { eq } from 'drizzle-orm'
import { hostDataDirForBinds, loadBootstrapConfig } from './config'
import { getDb, sidecarSettings } from './db'
import { firstPublishPort, probeHostPort } from './hostProbe'
import { seedSidecarData } from './sidecarData'
import { CORE_SIDECAR_ID, WHISPER_SIDECAR_ID, defaultSidecarAutostart, getSidecar, projectName, shouldAutostartSidecar, type SidecarMeta } from './sidecars'
import { isWhisperEnabled } from './whisperSettings'

const NETWORK = process.env.BROS_NETWORK || 'bros'

let docker: Docker | null = null

export function getDocker() {
  if (!docker) docker = new Docker({ socketPath: '/var/run/docker.sock' })
  return docker
}

/** Empty `${BROS_HOST_DATA_DIR}/ollama` interpolates to host `/ollama`. */
export function isMissingHostDataBind(source: string, hostData: string): boolean {
  const src = source.replace(/\/+$/, '')
  const base = hostData.replace(/\/+$/, '')
  if (src === base || src.startsWith(`${base}/`)) return false
  return src.split('/').filter(Boolean).length === 1
}

function composeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BROS_HOST_DATA_DIR: hostDataDirForBinds(),
    BROS_HOST_HOME_BIND: process.env.BROS_HOST_HOME_BIND?.trim() || process.env.HOME || '',
    OLLAMA_NOPRUNE: '1',
  }
}

function run(cmd: string, args: string[], cwd: string, timeoutMs = 120_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: composeEnv() })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ code: 124, stdout, stderr: stderr || `timeout after ${timeoutMs}ms` })
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += String(d) })
    child.stderr.on('data', (d) => { stderr += String(d) })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

async function sidecarBindsNeedRecreate(project: string, hostData: string): Promise<boolean> {
  try {
    const d = getDocker()
    const containers = await d.listContainers({
      all: true,
      filters: { label: [`com.docker.compose.project=${project}`] },
    })
    for (const c of containers) {
      const info = await d.getContainer(c.Id).inspect()
      for (const m of info.Mounts || []) {
        if (m.Type !== 'bind' || !m.Source) continue
        if (isMissingHostDataBind(m.Source, hostData)) return true
      }
    }
  } catch {
    return false
  }
  return false
}

async function ensureNetwork() {
  const d = getDocker()
  try {
    await d.getNetwork(NETWORK).inspect()
  } catch {
    await d.createNetwork({ Name: NETWORK, Driver: 'bridge', CheckDuplicate: true })
  }
}

export async function pingDocker(): Promise<{ ok: boolean; error?: string }> {
  try {
    await getDocker().ping()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

const CORE_COMPOSE_PROJECT = 'bros'
const SIDECAR_PROJECT_PREFIX = 'bros-sc-'

export type BrosManagedContainer = {
  id: string
  name: string
  service: string
  project: string
  kind: 'app' | 'sidecar'
  sidecarId: string | null
  state: string
  status: string
  running: boolean
  ports: number[]
  image: string
}

export type BrosContainerListItem = {
  Id?: string
  Names?: string[]
  State?: string
  Status?: string
  Image?: string
  Labels?: Record<string, string>
  Ports?: Array<{ PublicPort?: number }>
}

export function containerNames(c: BrosContainerListItem): string[] {
  return (c.Names || []).map((n) => n.replace(/^\//, '')).filter(Boolean)
}

export function isBrosManagedContainer(c: BrosContainerListItem): boolean {
  const project = c.Labels?.['com.docker.compose.project'] || ''
  if (project === CORE_COMPOSE_PROJECT || project.startsWith(SIDECAR_PROJECT_PREFIX)) return true
  const names = containerNames(c)
  if (names.some((n) => n === 'bros' || n.startsWith(SIDECAR_PROJECT_PREFIX))) return true
  const service = c.Labels?.['com.docker.compose.service'] || ''
  const image = c.Image || ''
  return service === 'bros' && (image === 'bros' || image.startsWith('bros:'))
}

export function toBrosManagedContainer(c: BrosContainerListItem): BrosManagedContainer {
  const names = containerNames(c)
  const name = names[0] || c.Id?.slice(0, 12) || 'unknown'
  const project = c.Labels?.['com.docker.compose.project']
    || (name === 'bros' ? CORE_COMPOSE_PROJECT : name.startsWith(SIDECAR_PROJECT_PREFIX) ? name.replace(/-[a-z0-9]+-\d+$/i, '') : '')
  const sidecarId = project.startsWith(SIDECAR_PROJECT_PREFIX) ? project.slice(SIDECAR_PROJECT_PREFIX.length) : null
  const kind: 'app' | 'sidecar' = sidecarId ? 'sidecar' : 'app'
  const service = c.Labels?.['com.docker.compose.service'] || (kind === 'app' ? 'bros' : name)
  const state = (c.State || 'unknown').toLowerCase()
  const ports = [...new Set((c.Ports || []).map((p) => p.PublicPort).filter((p): p is number => typeof p === 'number' && p > 0))].sort((a, b) => a - b)
  return {
    id: c.Id || name,
    name,
    service,
    project,
    kind,
    sidecarId,
    state,
    status: c.Status || state,
    running: state === 'running',
    ports,
    image: c.Image || '',
  }
}

function compareBrosManaged(a: BrosManagedContainer, b: BrosManagedContainer): number {
  if (a.kind !== b.kind) return a.kind === 'app' ? -1 : 1
  const p = a.project.localeCompare(b.project)
  if (p) return p
  const s = a.service.localeCompare(b.service)
  if (s) return s
  return a.name.localeCompare(b.name)
}

/** App (`bros`) plus every `bros-sc-*` compose container, including stopped. */
export async function listBrosManagedContainers(): Promise<BrosManagedContainer[]> {
  try {
    const containers = await getDocker().listContainers({ all: true })
    return containers.filter(isBrosManagedContainer).map(toBrosManagedContainer).sort(compareBrosManaged)
  } catch {
    return []
  }
}

/** Running containers' published host TCP ports. */
export async function listPublishedHostPorts(): Promise<Array<{
  port: number
  project?: string
  containerName?: string
  image?: string
}>> {
  const d = getDocker()
  const containers = await d.listContainers({ all: false })
  const out: PublishedHostPort[] = []
  for (const c of containers) {
    const project = c.Labels?.['com.docker.compose.project']
    const containerName = (c.Names || [])[0]
    const image = c.Image
    for (const p of c.Ports || []) {
      if (typeof p.PublicPort === 'number' && p.PublicPort > 0) {
        out.push({ port: p.PublicPort, project, containerName, image })
      }
    }
  }
  return out
}

export async function publishedPortOwner(hostPort: number): Promise<{ project?: string; containerName?: string } | null> {
  const d = getDocker()
  const containers = await d.listContainers({ all: true })
  for (const c of containers) {
    for (const p of c.Ports || []) {
      if (p.PublicPort === hostPort) {
        return {
          project: c.Labels?.['com.docker.compose.project'],
          containerName: (c.Names || [])[0],
        }
      }
    }
  }
  return null
}

export async function projectHasContainers(id: string): Promise<boolean> {
  const d = getDocker()
  const containers = await d.listContainers({
    all: true,
    filters: { label: [`com.docker.compose.project=${projectName(id)}`] },
  })
  return containers.length > 0
}

async function projectStatusFromDockerode(name: string) {
  const containers = await getDocker().listContainers({
    all: true,
    filters: { label: [`com.docker.compose.project=${name}`] },
  })
  const services = containers.map((c) => ({
    name: c.Labels?.['com.docker.compose.service'] || containerNames(c)[0] || 'unknown',
    state: c.State || 'unknown',
  }))
  const running = services.some((s) => String(s.state).toLowerCase().includes('running'))
  return { project: name, running, services }
}

export async function getProjectStatus(sidecar: SidecarMeta) {
  const name = projectName(sidecar.id)
  const composeFile = join(sidecar.dir, 'docker-compose.yml')
  const result = await run(
    'docker',
    ['compose', '-p', name, '-f', composeFile, 'ps', '--format', 'json'],
    sidecar.dir,
    30_000,
  )
  if (result.code === 0) {
    const lines = result.stdout.trim().split('\n').filter(Boolean)
    const services = lines.map((line) => {
      try {
        const row = JSON.parse(line)
        return { name: row.Service || row.Name, state: row.State || row.Status || 'unknown' }
      } catch {
        return { name: 'unknown', state: 'unknown' }
      }
    })
    if (services.length) {
      const running = services.some((s) => String(s.state).toLowerCase().includes('running'))
      return { project: name, running, services }
    }
  }
  try {
    return await projectStatusFromDockerode(name)
  } catch {
    return { project: name, running: false, services: [] as Array<{ name: string; state: string }> }
  }
}

export async function sidecarRuntime(sidecar: SidecarMeta) {
  const settings = getSidecarSetting(sidecar.id)
  const status = sidecar.error
    ? { project: projectName(sidecar.id), running: false, services: [] as Array<{ name: string; state: string }> }
    : await getProjectStatus(sidecar)
  const hostPort = firstPublishPort(sidecar.interfaces)
  let portOccupied = false
  let ours = status.running
  if (typeof hostPort === 'number') {
    portOccupied = await probeHostPort(hostPort)
    try {
      const owner = await publishedPortOwner(hostPort)
      if (owner?.project === projectName(sidecar.id)) ours = true
    } catch {
      // docker inspect failed — fall back to compose status
    }
  }
  const warnPortTaken = portOccupied && !ours
  const warning = warnPortTaken && hostPort
    ? `Port ${hostPort} is already in use. Bros sidecar cannot start until it is free.`
    : undefined
  let hostOllama: { port: number; version: string } | null = null
  let hostOllamaError: string | null = null
  if (sidecar.id === 'ollama') {
    const { findHostOllama } = await import('./ollamaHost')
    const hit = await findHostOllama()
    hostOllama = hit.port != null && hit.version ? { port: hit.port, version: hit.version } : null
    hostOllamaError = hit.error
  }
  return { settings, status, hostPort, portOccupied, ours, warnPortTaken, warning, hostOllama, hostOllamaError }
}

export async function execInSidecar(
  id: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
  const name = projectName(id)
  return run(
    'docker',
    ['compose', '-p', name, '-f', join(sidecar.dir, 'docker-compose.yml'), 'exec', '-T', sidecar.id, ...args],
    sidecar.dir,
    timeoutMs,
  )
}

export async function pullSidecarImages(id: string) {
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
  if (sidecar.error) throw createError({ statusCode: 400, statusMessage: sidecar.error })
  const name = projectName(id)
  const res = await run(
    'docker',
    ['compose', '-p', name, '-f', join(sidecar.dir, 'docker-compose.yml'), 'pull'],
    sidecar.dir,
    600_000,
  )
  if (res.code !== 0) {
    throw createError({
      statusCode: 500,
      statusMessage: res.stderr || res.stdout || 'Failed to pull sidecar images',
    })
  }
}

export async function startSidecar(id: string) {
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
  if (sidecar.error) throw createError({ statusCode: 400, statusMessage: sidecar.error })
  seedSidecarData(sidecar.dir, join(loadBootstrapConfig().dataDir, sidecar.id))
  const probed = await sidecarRuntime(sidecar)
  if (probed.portOccupied && !probed.ours && probed.hostPort) {
    throw createError({
      statusCode: 409,
      statusMessage: `Port ${probed.hostPort} is already in use.`,
    })
  }
  await ensureNetwork()
  const name = projectName(id)
  const composeArgs = ['compose', '-p', name, '-f', join(sidecar.dir, 'docker-compose.yml')]
  let forceRecreate = false
  const hostData = hostDataDirForBinds()
  if (await sidecarBindsNeedRecreate(name, hostData)) forceRecreate = true

  if (id === 'ollama') {
    const { getProvider } = await import('./providers')
    const { detectGpu } = await import('./gpu')
    const provider = getProvider('ollama')
    const wantGpu = Boolean(provider?.config?.useGpu)
    if (wantGpu) {
      const gpu = await detectGpu()
      if (!gpu.available) {
        throw createError({ statusCode: 400, statusMessage: 'GPU requested but none detected on host' })
      }
      const gpuFile = join(sidecar.dir, 'docker-compose.gpu.yml')
      composeArgs.push('-f', gpuFile)
      // Recreate so device reservations apply if a CPU-only container already exists.
      forceRecreate = true
    }
    try {
      const owner11434 = await publishedPortOwner(11434)
      if (owner11434?.project === name) forceRecreate = true
    } catch {
      // ignore
    }
  }

  const upArgs = forceRecreate
    ? [...composeArgs, 'up', '-d', '--remove-orphans', '--force-recreate']
    : [...composeArgs, 'up', '-d', '--remove-orphans']
  const up = await run(
    'docker',
    upArgs,
    sidecar.dir,
    600_000,
  )
  if (up.code !== 0) {
    const taken = probed.warnPortTaken && probed.hostPort
      ? ` Port ${probed.hostPort} is already in use.`
      : ''
    throw createError({
      statusCode: 500,
      statusMessage: `${up.stderr || up.stdout || 'Failed to start sidecar'}${taken}`,
    })
  }
  // attach containers to shared network with Compose service aliases for DNS
  const d = getDocker()
  const containers = await d.listContainers({ all: true, filters: { label: [`com.docker.compose.project=${name}`] } })
  for (const c of containers) {
    const service = c.Labels?.['com.docker.compose.service'] || sidecar.id
    const aliases = Array.from(new Set([service, sidecar.id, sidecar.packageSlug].filter(Boolean)))
    try {
      await d.getNetwork(NETWORK).connect({
        Container: c.Id,
        EndpointConfig: { Aliases: aliases },
      })
    } catch {
      // already connected — reconnect with aliases
      try {
        await d.getNetwork(NETWORK).disconnect({ Container: c.Id, Force: true })
      } catch {
        // ignore
      }
      try {
        await d.getNetwork(NETWORK).connect({
          Container: c.Id,
          EndpointConfig: { Aliases: aliases },
        })
      } catch (err) {
        console.error('network alias attach failed', c.Id, err)
      }
    }
  }
  const status = await getProjectStatus(sidecar)
  if (id === 'ollama') {
    try {
      const { ensureInternalBrosModel } = await import('./internalBrosModel')
      await ensureInternalBrosModel()
    }
    catch (err) {
      console.error('internal bros model ensure failed', err)
    }
  }
  return {
    ...status,
    skipped: false,
    warning: undefined,
  }
}

export async function sidecarLogs(id: string, tail = 200) {
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
  const name = projectName(id)
  const capped = Math.min(Math.max(tail, 1), 2000)
  const res = await run(
    'docker',
    ['compose', '-p', name, '-f', join(sidecar.dir, 'docker-compose.yml'), 'logs', '--no-color', '--tail', String(capped)],
    sidecar.dir,
    30_000,
  )
  return {
    id,
    project: name,
    logs: (res.stdout || res.stderr || '').trim(),
    error: res.code !== 0 ? (res.stderr || res.stdout || 'Failed to read logs') : undefined,
  }
}

export async function stopSidecar(id: string) {
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
  const name = projectName(id)
  const res = await run(
    'docker',
    ['compose', '-p', name, '-f', join(sidecar.dir, 'docker-compose.yml'), 'down', '--timeout', '10'],
    sidecar.dir,
    60_000,
  )
  if (res.code !== 0) {
    throw createError({ statusCode: 500, statusMessage: res.stderr || 'Failed to stop sidecar' })
  }
  return getProjectStatus(sidecar)
}

export async function restartSidecar(id: string) {
  await stopSidecar(id)
  return startSidecar(id)
}

export function getSidecarSetting(id: string) {
  const row = getDb().select().from(sidecarSettings).where(eq(sidecarSettings.sidecarId, id)).get()
  return {
    autostart: id === CORE_SIDECAR_ID
      ? true
      : id === WHISPER_SIDECAR_ID
        ? isWhisperEnabled()
        : (row?.autostart ?? defaultSidecarAutostart(id)),
    navPinned: row?.navPinned ?? false,
    hostProbePort: typeof row?.hostProbePort === 'number' && row.hostProbePort > 0 ? row.hostProbePort : null,
  }
}

export function setSidecarSetting(id: string, patch: {
  autostart?: boolean
  navPinned?: boolean
  hostProbePort?: number | null
}) {
  const current = getSidecarSetting(id)
  const next = {
    sidecarId: id,
    autostart: id === CORE_SIDECAR_ID
      ? true
      : id === WHISPER_SIDECAR_ID
        ? current.autostart
        : (patch.autostart ?? current.autostart),
    navPinned: patch.navPinned ?? current.navPinned,
    hostMode: 'auto',
    hostProbePort: id === CORE_SIDECAR_ID
      ? (patch.hostProbePort === undefined ? current.hostProbePort : patch.hostProbePort)
      : null,
  }
  const db = getDb()
  const existing = db.select().from(sidecarSettings).where(eq(sidecarSettings.sidecarId, id)).get()
  if (existing) db.update(sidecarSettings).set(next).where(eq(sidecarSettings.sidecarId, id)).run()
  else db.insert(sidecarSettings).values(next).run()
  if (id === CORE_SIDECAR_ID && patch.hostProbePort !== undefined) {
    void import('./ollamaHost').then((m) => m.resetOllamaHostCache())
  }
  return {
    sidecarId: next.sidecarId,
    autostart: next.autostart,
    navPinned: next.navPinned,
    hostProbePort: next.hostProbePort,
  }
}

export async function autostartSidecars() {
  const { discoverSidecars } = await import('./sidecars')
  const { sidecars } = discoverSidecars()
  for (const s of sidecars) {
    if (s.error) continue
    if (s.id === WHISPER_SIDECAR_ID) {
      if (!isWhisperEnabled()) continue
      try {
        await startSidecar(s.id)
      } catch (err) {
        console.error('autostart failed', s.id, err)
      }
      continue
    }
    const settings = getSidecarSetting(s.id)
    if (shouldAutostartSidecar(s, settings)) {
      try {
        await startSidecar(s.id)
      } catch (err) {
        console.error('autostart failed', s.id, err)
      }
    }
  }
}
