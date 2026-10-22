import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Docker from 'dockerode'
import { eq } from 'drizzle-orm'
import { hostDataDirForBinds, hostWorkspaceForCompose, loadBootstrapConfig } from './config'
import { ensureHomeDirs } from './homePaths'
import { getDb, sidecarSettings } from './db'
import { firstPublishPort, probeHostPort } from './hostProbe'
import { cliHostDirs, cliPacks, describeCli, syncCliBridges } from './sidecars/cliBridge'
import { seedSidecarData } from './sidecars/sidecarData'
import { DESKTOP_SIDECAR_ID, CORE_SIDECAR_ID, WHISPER_SIDECAR_ID, defaultSidecarAutostart, discoverSidecars, getSidecar, projectName, shouldAutostartSidecar, type SidecarMeta } from './sidecars/sidecars'
import { isWhisperEnabled } from './settings'

const NETWORK = process.env.BROS_NETWORK || 'bros'

let docker: Docker | null = null
const startingSidecarIds = new Set<string>()
const autostartFailed = new Map<string, string>()
let bootPending = true

/** True until this process finishes its one autostart pass. False while prerendering. */
export function servicesBootPending(prerender = import.meta.prerender) {
  if (prerender) return false
  return bootPending
}

export function isSidecarStarting(id: string) {
  return startingSidecarIds.has(id)
}

export function markAutostartFailed(id: string, message?: string) {
  autostartFailed.set(id, message || 'error')
}

export function autostartFailure(id: string): string | null {
  return autostartFailed.get(id) ?? null
}

export function sidecarPhase(id: string, running: boolean, error?: string): 'starting' | 'running' | 'stopped' | 'error' {
  if (running) autostartFailed.delete(id)
  if (isSidecarStarting(id) && !running) return 'starting'
  if (error || autostartFailed.has(id)) return 'error'
  return running ? 'running' : 'stopped'
}

export function composeUsesDesktopNetns(dir: string): boolean {
  try {
    return readFileSync(join(dir, 'docker-compose.yml'), 'utf8').includes('container:bros-desktop')
  } catch {
    return false
  }
}

/** Cursor shares Desktop's network namespace, so a second network attach is rejected. */
export function shouldAttachProjectNetwork(dir: string): boolean {
  return !composeUsesDesktopNetns(dir)
}

/**
 * Autostart must not rebuild an image that already exists.
 * A package apply passes `rebuild`. A missing image still builds.
 */
export function shouldBuildSidecarImage(imageReady: boolean, rebuild: boolean): boolean {
  return rebuild || !imageReady
}

function composeImageRef(dir: string): string | null {
  try {
    const match = readFileSync(join(dir, 'docker-compose.yml'), 'utf8').match(/^\s*image:\s*([^\s#]+)/m)
    return match?.[1] || null
  } catch {
    return null
  }
}

function failureText(err: unknown): string {
  if (err && typeof err === 'object') {
    const row = err as { statusMessage?: unknown; message?: unknown }
    if (typeof row.statusMessage === 'string' && row.statusMessage) return row.statusMessage
    if (typeof row.message === 'string' && row.message) return row.message
  }
  return 'error'
}

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
    BROS_HOST_WORKSPACE: hostWorkspaceForCompose(),
    BROS_HOST_HOME_BIND: process.env.BROS_HOST_HOME_BIND?.trim() || process.env.HOME || '',
    BROS_HOST_UID: process.env.BROS_HOST_UID?.trim() || String(process.getuid?.() ?? 1000),
    BROS_HOST_GID: process.env.BROS_HOST_GID?.trim() || String(process.getgid?.() ?? 1000),
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

async function ensureNamedVolume(name: string) {
  const d = getDocker()
  try {
    await d.getVolume(name).inspect()
  } catch {
    await d.createVolume({ Name: name })
  }
}

async function ensureX11Volume() {
  await ensureNamedVolume('bros-x11')
  await ensureNamedVolume('bros-run')
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
    const { findHostOllama } = await import('./providers/ollamaHost')
    const hit = await findHostOllama()
    hostOllama = hit.port != null && hit.version ? { port: hit.port, version: hit.version } : null
    hostOllamaError = hit.error
  }
  const cli = describeCli(sidecar, status.running)
  return { settings, status, hostPort, portOccupied, ours, warnPortTaken, warning, hostOllama, hostOllamaError, cli }
}

export async function execInSidecar(
  id: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
  const name = projectName(id)
  const service = sidecar.interfaces.find((iface) => iface.service)?.service || sidecar.id
  return run(
    'docker',
    ['compose', '-p', name, '-f', join(sidecar.dir, 'docker-compose.yml'), 'exec', '-T', service, ...args],
    sidecar.dir,
    timeoutMs,
  )
}

/** HTTP status line stays one ASCII line. Docker text goes in `message` so h3 does not warn. */
export function dockerCommandError(statusCode: number, fallback: string, detail: string) {
  const message = detail.trim() || fallback
  return { statusCode, statusMessage: fallback, message }
}

/** False while Nitro is prerendering the image build. */
export function shouldRunAutostart(prerender = import.meta.prerender) {
  return !prerender
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
    throw createError(dockerCommandError(500, 'Failed to pull sidecar images', res.stderr || res.stdout || 'Failed to pull sidecar images'))
  }
}

export function containerNameConflict(text: string): string | null {
  const match = text.match(/container name "\/?([^"]+)" is already in use/i)
  return match?.[1] || null
}

const startJobs = new Map<string, Promise<unknown>>()

export async function pullSidecar(id: string, opts?: { dryRun?: boolean }) {
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
  const pull = await run('docker', [
    'compose', '-p', projectName(id), '-f', join(sidecar.dir, 'docker-compose.yml'),
    'pull',
    ...(opts?.dryRun ? ['--dry-run'] : []),
  ], sidecar.dir, 600_000)
  if (opts?.dryRun || pull.code !== 0) return pull
  await startSidecar(id, { forceRecreate: true })
  return pull
}

export function startSidecar(id: string, opts?: { forceRecreate?: boolean; rebuild?: boolean }) {
  if (!opts?.forceRecreate) {
    const existing = startJobs.get(id)
    if (existing) return existing as ReturnType<typeof runStartSidecar>
  }
  const job = runStartSidecar(id, opts)
  startJobs.set(id, job)
  return job.finally(() => {
    if (startJobs.get(id) === job) startJobs.delete(id)
  })
}

// shortcut: 3s desktop-up cache. Drop it if a stop must show in the stream on the next asset.
let desktopUpUntil = 0

export async function ensureAppsRunning() {
  if (Date.now() < desktopUpUntil) return
  const sidecar = getSidecar(DESKTOP_SIDECAR_ID)
  if (!sidecar) throw createError({ statusCode: 500, statusMessage: 'Desktop sidecar is missing' })
  if (sidecar.error) throw createError({ statusCode: 400, statusMessage: sidecar.error })
  if (!(await getProjectStatus(sidecar)).running) await startSidecar(DESKTOP_SIDECAR_ID)
  desktopUpUntil = Date.now() + 3_000
}

async function runningContainerName(id: string): Promise<string> {
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
  const service = sidecar.interfaces.find((iface) => iface.service)?.service || sidecar.id
  const list = await getDocker().listContainers({
    all: true,
    filters: {
      label: [
        `com.docker.compose.project=${projectName(id)}`,
        `com.docker.compose.service=${service}`,
      ],
    },
  })
  const row = list.find((item) => item.State === 'running') || list[0]
  const name = row?.Names?.[0]?.replace(/^\//, '')
  if (!name) throw createError({ statusCode: 500, statusMessage: 'Sidecar container is missing' })
  return name
}

export async function ensureSidecarGui(id: string) {
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
  const iface = sidecar.interfaces.find((row) => row.type === 'gui' && row.command)
  if (!iface?.command) throw createError({ statusCode: 404, statusMessage: 'GUI app not found' })
  await ensureAppsRunning()
  const container = await runningContainerName(id)
  const cmd = iface.command
  const res = await execInSidecar(DESKTOP_SIDECAR_ID, ['/app/lib/sidecars/core/desktop/desktop-gui.sh', 'start', id, '--container', container, '--', cmd])
  if (res.code !== 0) {
    throw createError(dockerCommandError(500, 'Desktop app failed to start', res.stderr || res.stdout || 'Desktop app failed to start'))
  }
}

export async function stopGuiSession(id: string) {
  const sidecar = getSidecar(DESKTOP_SIDECAR_ID)
  if (!sidecar || sidecar.error || !(await getProjectStatus(sidecar)).running) return
  const res = await execInSidecar(DESKTOP_SIDECAR_ID, ['/app/lib/sidecars/core/desktop/desktop-gui.sh', 'stop', id])
  if (res.code !== 0) {
    throw createError(dockerCommandError(500, 'Desktop app failed to stop', res.stderr || res.stdout || 'Desktop app failed to stop'))
  }
}

async function runStartSidecar(id: string, opts?: { forceRecreate?: boolean; rebuild?: boolean }) {
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
  if (sidecar.error) throw createError({ statusCode: 400, statusMessage: sidecar.error })
  startingSidecarIds.add(id)
  try {
  const boot = loadBootstrapConfig()
  seedSidecarData(sidecar.dir, join(boot.dataDir, sidecar.id))
  ensureHomeDirs(boot.dataDir, sidecar.home || [])
  const probed = await sidecarRuntime(sidecar)
  if (probed.portOccupied && !probed.ours && probed.hostPort) {
    throw createError({
      statusCode: 409,
      statusMessage: `Port ${probed.hostPort} is already in use.`,
    })
  }
  await ensureNetwork()
  await ensureX11Volume()
  const name = projectName(id)
  const composeArgs = ['compose', '-p', name, '-f', join(sidecar.dir, 'docker-compose.yml')]
  let desktopHash: string | null = null
  let desktopAppsChanged = false
  if (id === DESKTOP_SIDECAR_ID) {
    const override = join(loadBootstrapConfig().dataDir, 'config', 'apps-compose.yml')
    if (existsSync(override)) composeArgs.push('-f', override)
    const { prepareDesktopAppBuild } = await import('./cli/packages')
    const prep = prepareDesktopAppBuild()
    desktopHash = prep.hash
    desktopAppsChanged = prep.changed
  }
  let forceRecreate = !!opts?.forceRecreate
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

  const dockerfile = existsSync(join(sidecar.dir, 'Dockerfile'))
  const imageRef = dockerfile ? composeImageRef(sidecar.dir) : null
  const imageReady = imageRef ? (await run('docker', ['image', 'inspect', imageRef], sidecar.dir, 15_000)).code === 0 : false
  const build = dockerfile && shouldBuildSidecarImage(imageReady, !!opts?.rebuild)
  const upArgs = [
    ...composeArgs,
    'up',
    '-d',
    '--remove-orphans',
    ...(build ? ['--build'] : []),
    ...(forceRecreate ? ['--force-recreate'] : []),
  ]
  if (id !== DESKTOP_SIDECAR_ID && composeUsesDesktopNetns(sidecar.dir)) {
    await ensureAppsRunning()
    const inspect = await run('docker', ['inspect', '-f', '{{.State.Running}}', 'bros-desktop'], sidecar.dir, 15_000)
    if (inspect.code !== 0 || inspect.stdout.trim() !== 'true') {
      throw createError({ statusCode: 400, statusMessage: 'Desktop failed to start' })
    }
  }
  let desktopWasRunning = false
  if (id === DESKTOP_SIDECAR_ID) desktopWasRunning = (await getProjectStatus(sidecar)).running
  let up = await run(
    'docker',
    upArgs,
    sidecar.dir,
    600_000,
  )
  const conflict = up.code !== 0 ? containerNameConflict(`${up.stderr || ''}\n${up.stdout || ''}`) : null
  if (conflict) {
    await run('docker', ['rm', '-f', conflict], sidecar.dir, 60_000)
    up = await run('docker', upArgs, sidecar.dir, 600_000)
  }
  let buildFailed = false
  if (up.code !== 0 && build && imageReady && /timeout|DeadlineExceeded|failed to resolve|failed to do request/i.test(`${up.stderr || ''}\n${up.stdout || ''}`)) {
    buildFailed = true
    up = await run('docker', upArgs.filter((arg) => arg !== '--build'), sidecar.dir, 600_000)
  }
  if (up.code !== 0) {
    const taken = probed.warnPortTaken && probed.hostPort
      ? ` Port ${probed.hostPort} is already in use.`
      : ''
    throw createError(dockerCommandError(
      500,
      'Failed to start sidecar',
      `${up.stderr || up.stdout || 'Failed to start sidecar'}${taken}`,
    ))
  }
  if (desktopHash) {
    const { shouldWriteDesktopStamp, writeDesktopAppStamp } = await import('./cli/packages')
    if (shouldWriteDesktopStamp(build, buildFailed, desktopAppsChanged)) writeDesktopAppStamp(desktopHash)
  }
  if (buildFailed) {
    throw new Error('Desktop image was not rebuilt. The previous image is still running.')
  }
  // Cursor shares Desktop's netns. Attaching it to `bros` fails and a force
  // disconnect can drop that namespace.
  if (shouldAttachProjectNetwork(sidecar.dir)) {
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
  await refreshCliBridges()
  let warning: string | undefined
  if (id === DESKTOP_SIDECAR_ID && (build || forceRecreate || !desktopWasRunning)) {
    const { waitForDesktopSession } = await import('./desktopReady')
    const gaps = await waitForDesktopSession()
    if (gaps) warning = `Desktop session is not ready: ${gaps}`
  }
  return {
    ...status,
    skipped: false,
    warning,
  }
  }
  finally {
    startingSidecarIds.delete(id)
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
  if (sidecar.interfaces.some((iface) => iface.type === 'gui')) {
    try {
      await stopGuiSession(id)
    } catch (err) {
      console.error('gui session stop failed', id, err)
    }
  }
  const res = await run(
    'docker',
    ['compose', '-p', name, '-f', join(sidecar.dir, 'docker-compose.yml'), 'down', '--timeout', '10'],
    sidecar.dir,
    60_000,
  )
  if (res.code !== 0) {
    throw createError(dockerCommandError(500, 'Failed to stop sidecar', res.stderr || 'Failed to stop sidecar'))
  }
  await refreshCliBridges()
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
    hostMode: row?.hostMode === 'host' || row?.hostMode === 'sidecar' ? row.hostMode : 'auto',
    exposeHost: row?.exposeHost ?? true,
    hostProbePort: typeof row?.hostProbePort === 'number' && row.hostProbePort > 0 ? row.hostProbePort : null,
  }
}

export function setSidecarSetting(id: string, patch: {
  autostart?: boolean
  navPinned?: boolean
  hostMode?: string
  exposeHost?: boolean
  hostProbePort?: number | null
}) {
  const current = getSidecarSetting(id)
  const hostMode = patch.hostMode === 'host' || patch.hostMode === 'sidecar' || patch.hostMode === 'auto'
    ? patch.hostMode
    : current.hostMode
  const next = {
    sidecarId: id,
    autostart: id === CORE_SIDECAR_ID
      ? true
      : id === WHISPER_SIDECAR_ID
        ? current.autostart
        : (patch.autostart ?? current.autostart),
    navPinned: patch.navPinned ?? current.navPinned,
    hostMode,
    exposeHost: patch.exposeHost ?? current.exposeHost,
    hostProbePort: id === CORE_SIDECAR_ID
      ? (patch.hostProbePort === undefined ? current.hostProbePort : patch.hostProbePort)
      : null,
  }
  const db = getDb()
  const existing = db.select().from(sidecarSettings).where(eq(sidecarSettings.sidecarId, id)).get()
  if (existing) db.update(sidecarSettings).set(next).where(eq(sidecarSettings.sidecarId, id)).run()
  else db.insert(sidecarSettings).values(next).run()
  if (id === CORE_SIDECAR_ID && patch.hostProbePort !== undefined) {
    void import('./providers/ollamaHost').then((m) => m.resetOllamaHostCache())
  }
  return {
    sidecarId: next.sidecarId,
    autostart: next.autostart,
    navPinned: next.navPinned,
    hostMode: next.hostMode,
    exposeHost: next.exposeHost,
    hostProbePort: next.hostProbePort,
  }
}

export async function refreshCliBridges() {
  try {
    const { sidecars } = discoverSidecars()
    const running = new Set<string>()
    for (const s of sidecars) {
      if (!s.interfaces.some((iface) => iface.type === 'cli')) continue
      try {
        if ((await getProjectStatus(s)).running) running.add(s.id)
      }
      catch {
        // compose ps failed — treat as stopped
      }
    }
    const { hostBinDir, execBinDir } = cliHostDirs()
    syncCliBridges({
      sidecars: cliPacks(sidecars),
      running,
      brosBinDir: join(loadBootstrapConfig().dataDir, 'home', '.local', 'sidecar-bins'),
      hostBinDir,
      execBinDir,
    })
  }
  catch (err) {
    console.error('cli bridge sync failed', err)
  }
}

export async function autostartSidecars() {
  try {
    if (!shouldRunAutostart()) return
    const { sidecars } = discoverSidecars()
    const queue: SidecarMeta[] = []
    for (const s of sidecars) {
      if (s.error) continue
      if (s.id === WHISPER_SIDECAR_ID) {
        if (!isWhisperEnabled()) continue
      }
      else if (!shouldAutostartSidecar(s, getSidecarSetting(s.id))) continue
      startingSidecarIds.add(s.id)
      queue.push(s)
    }
    const first: SidecarMeta[] = []
    const afterDesktop: SidecarMeta[] = []
    for (const s of queue) (composeUsesDesktopNetns(s.dir) ? afterDesktop : first).push(s)
    await startQueued(first)
    await startQueued(afterDesktop)
    await refreshCliBridges()
  }
  finally {
    bootPending = false
  }
}

async function startQueued(queue: SidecarMeta[]) {
  await Promise.all(queue.map(async (s) => {
    try {
      const runtime = await sidecarRuntime(s)
      if (runtime.status.running || (runtime.portOccupied && !runtime.ours)) {
        startingSidecarIds.delete(s.id)
        return
      }
      await startSidecar(s.id)
    }
    catch (err) {
      markAutostartFailed(s.id, failureText(err))
      startingSidecarIds.delete(s.id)
      console.error('autostart failed', s.id, err)
    }
  }))
}
