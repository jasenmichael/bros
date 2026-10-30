import { spawn } from 'node:child_process'
import { createError } from 'h3'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Docker from 'dockerode'
import { eq } from 'drizzle-orm'
import { hostDataDirForBinds, hostWorkspaceForCompose, loadBootstrapConfig } from './config'
import { ensureHomeDirs } from './homePaths'
import { getDb, dockerAppSettings } from './db'
import { firstPublishPort, probeHostPort } from './hostProbe'
import { cliHostDirs, cliPacks, describeCli, syncCliBridges } from './docker-app/cliBridge'
import { seedDockerAppData } from './docker-app/dockerAppData'
import { ensureOmnirouteJwtSecret } from './docker-app/omnirouteSecret'
import { isCoreAppEnabled } from './docker-app/coreAppEnabled'
import { CORE_DOCKER_APP_ID, WHISPER_DOCKER_APP_ID, defaultDockerAppAutostart, discoverDockerApps, getDockerApp, projectName, shouldAutostartDockerApp, type DockerAppMeta } from './docker-app/dockerApps'

const NETWORK = process.env.BROS_NETWORK || 'bros'

let docker: Docker | null = null
const startingDockerAppIds = new Set<string>()
const autostartFailed = new Map<string, string>()
let bootPending = true

/** Read each call — a module-level capture is false during image-build prerender. */
function nitroIsPrerender() {
  return Boolean((import.meta as { prerender?: boolean }).prerender)
}

/** True until this process finishes its one autostart pass. False while prerendering. */
export function servicesBootPending(prerender = nitroIsPrerender()) {
  if (prerender) return false
  return bootPending
}

export function isDockerAppStarting(id: string) {
  return startingDockerAppIds.has(id)
}

export function markAutostartFailed(id: string, message?: string) {
  autostartFailed.set(id, message || 'error')
}

export function autostartFailure(id: string): string | null {
  return autostartFailed.get(id) ?? null
}

export function dockerAppPhase(id: string, running: boolean, error?: string): 'starting' | 'running' | 'stopped' | 'error' {
  if (running) {
    autostartFailed.delete(id)
    // Running wins over a stale autostartFailure still held by the caller.
    return 'running'
  }
  if (isDockerAppStarting(id)) return 'starting'
  if (error || autostartFailed.has(id)) return 'error'
  return 'stopped'
}

export function composeUsesDesktopNetns(dir: string): boolean {
  try {
    return readFileSync(join(dir, 'docker-compose.yml'), 'utf8').includes('container:bros')
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
export function shouldBuildDockerAppImage(imageReady: boolean, rebuild: boolean): boolean {
  return rebuild || !imageReady
}

/** Local tag (`bros`) is built here. A registry image contains `/`. */
export function composeImageIsLocal(text: string): boolean {
  if (!/^\s*build:/m.test(text)) return false
  const image = text.match(/^\s*image:\s*([^\s#]+)/m)?.[1]
  return !image || !image.includes('/')
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

/** User compose must not share root's DOCKER_CONFIG (PUID HOME=/home/bros). */
export function dockerConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.DOCKER_CONFIG?.trim()
  if (fromEnv) return fromEnv
  return join(env.HOME?.trim() || '/home/bros', '.docker')
}

function composeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DOCKER_CONFIG: dockerConfigDir(),
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

async function dockerAppBindsNeedRecreate(project: string, hostData: string): Promise<boolean> {
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
const DOCKER_APP_PROJECT_PREFIX = 'bros-'

export type BrosManagedContainer = {
  id: string
  name: string
  service: string
  project: string
  kind: 'app' | 'docker'
  dockerAppId: string | null
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
  if (project === CORE_COMPOSE_PROJECT || project.startsWith(DOCKER_APP_PROJECT_PREFIX)) return true
  const names = containerNames(c)
  if (names.some((n) => n === 'bros' || n.startsWith(DOCKER_APP_PROJECT_PREFIX))) return true
  const service = c.Labels?.['com.docker.compose.service'] || ''
  const image = c.Image || ''
  return service === 'bros' && (image === 'bros' || image.startsWith('bros:'))
}

export function toBrosManagedContainer(c: BrosContainerListItem): BrosManagedContainer {
  const names = containerNames(c)
  const name = names[0] || c.Id?.slice(0, 12) || 'unknown'
  const project = c.Labels?.['com.docker.compose.project']
    || (name === 'bros' ? CORE_COMPOSE_PROJECT : name.startsWith(DOCKER_APP_PROJECT_PREFIX) ? name.replace(/-[a-z0-9]+-\d+$/i, '') : '')
  const dockerAppId = project.startsWith(DOCKER_APP_PROJECT_PREFIX) ? project.slice(DOCKER_APP_PROJECT_PREFIX.length) : null
  const kind: 'app' | 'docker' = dockerAppId ? 'docker' : 'app'
  const service = c.Labels?.['com.docker.compose.service'] || (kind === 'app' ? 'bros' : name)
  const state = (c.State || 'unknown').toLowerCase()
  const ports = [...new Set((c.Ports || []).map((p) => p.PublicPort).filter((p): p is number => typeof p === 'number' && p > 0))].sort((a, b) => a - b)
  return {
    id: c.Id || name,
    name,
    service,
    project,
    kind,
    dockerAppId,
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

/** App (`bros`) plus every `bros-*` compose container, including stopped. */
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
  const out: Array<{
    port: number
    project?: string
    containerName?: string
    image?: string
  }> = []
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

export async function getProjectStatus(dockerApp: DockerAppMeta) {
  const name = projectName(dockerApp.id)
  const composeFile = join(dockerApp.dir, 'docker-compose.yml')
  const result = await run(
    'docker',
    ['compose', '-p', name, '-f', composeFile, 'ps', '--format', 'json'],
    dockerApp.dir,
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

/** No warning for a stopped dockerApp that will not autostart. Start still probes the port. */
export function dockerAppPortWarning(input: {
  running: boolean
  autostart: boolean
  portOccupied: boolean
  ours: boolean
  hostPort?: number | null
}): string | undefined {
  if (!input.running && !input.autostart) return undefined
  if (input.portOccupied && !input.ours && input.hostPort) {
    return `Port ${input.hostPort} is already in use. Bros docker app cannot start until it is free.`
  }
  return undefined
}

async function readPublishedPort(dockerApp: DockerAppMeta, running: boolean) {
  const hostPort = firstPublishPort(dockerApp.interfaces)
  let portOccupied = false
  let ours = running
  if (typeof hostPort === 'number') {
    portOccupied = await probeHostPort(hostPort)
    try {
      const owner = await publishedPortOwner(hostPort)
      if (owner?.project === projectName(dockerApp.id)) ours = true
    } catch {
      // docker inspect failed — fall back to compose status
    }
  }
  return { hostPort, portOccupied, ours }
}

export async function dockerAppRuntime(dockerApp: DockerAppMeta) {
  const settings = getDockerAppSetting(dockerApp.id)
  const status = dockerApp.error
    ? { project: projectName(dockerApp.id), running: false, services: [] as Array<{ name: string; state: string }> }
    : await getProjectStatus(dockerApp)
  const skipProbe = !status.running && !settings.autostart
  const { hostPort, portOccupied, ours } = skipProbe
    ? { hostPort: firstPublishPort(dockerApp.interfaces), portOccupied: false, ours: false }
    : await readPublishedPort(dockerApp, status.running)
  const warnPortTaken = portOccupied && !ours
  const warning = dockerAppPortWarning({
    running: status.running,
    autostart: settings.autostart,
    portOccupied,
    ours,
    hostPort,
  })
  let hostOllama: { port: number; version: string } | null = null
  let hostOllamaError: string | null = null
  if (dockerApp.id === 'ollama') {
    const { findHostOllama } = await import('./providers/ollamaHost')
    const hit = await findHostOllama()
    hostOllama = hit.port != null && hit.version ? { port: hit.port, version: hit.version } : null
    hostOllamaError = hit.error
  }
  const cli = describeCli(dockerApp, status.running)
  return { settings, status, hostPort, portOccupied, ours, warnPortTaken, warning, hostOllama, hostOllamaError, cli }
}

export async function execInBros(
  args: string[],
  timeoutMs = 120_000,
  user?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const as = user ? ['-u', user] : []
  return run('docker', ['exec', ...as, 'bros', ...args], loadBootstrapConfig().workingDir, timeoutMs)
}

export async function brosContainerRunning(): Promise<boolean> {
  const inspect = await run('docker', ['inspect', '-f', '{{.State.Running}}', 'bros'], loadBootstrapConfig().workingDir, 15_000)
  return inspect.code === 0 && inspect.stdout.trim() === 'true'
}

export async function rebuildBrosContainer(opts?: { build?: boolean; forceRecreate?: boolean }) {
  const boot = loadBootstrapConfig()
  const repo = process.env.BROS_HOST_REPO?.trim() || boot.workingDir
  // Regenerate port/volume overlay so a stale `desktop:` key cannot stick after rename to `bros`.
  const { readCliPackages, writeAppsCompose } = await import('./cli/packages')
  writeAppsCompose(readCliPackages())
  const generated = join(boot.dataDir, 'build', 'desktop', 'Dockerfile')
  if (existsSync(generated)) process.env.BROS_DESKTOP_DOCKERFILE = generated
  const files = ['-f', join(repo, 'docker-compose.yml')]
  files.push('-f', join(repo, process.env.BROS_DEV === '1' ? 'docker-compose.dev.yml' : 'docker-compose.prod.yml'))
  const override = join(boot.dataDir, 'config', 'apps-compose.yml')
  if (existsSync(override)) files.push('-f', override)
  return run('docker', [
    'compose', ...files, 'up', '-d', '--no-deps',
    ...(opts?.build ? ['--build'] : []),
    ...(opts?.forceRecreate ? ['--force-recreate'] : []),
    'bros',
  ], repo, 600_000)
}

export async function execInDockerApp(
  id: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const dockerApp = getDockerApp(id)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: 'DockerApp not found' })
  const name = projectName(id)
  const service = dockerApp.interfaces.find((iface) => iface.service)?.service || dockerApp.id
  return run(
    'docker',
    ['compose', '-p', name, '-f', join(dockerApp.dir, 'docker-compose.yml'), 'exec', '-T', service, ...args],
    dockerApp.dir,
    timeoutMs,
  )
}

/** HTTP status line stays one ASCII line. Docker text goes in `message` so h3 does not warn. */
export function dockerCommandError(statusCode: number, fallback: string, detail: string) {
  const message = detail.trim() || fallback
  return { statusCode, statusMessage: fallback, message }
}

/**
 * False while Nitro is prerendering the image build, and when host data
 * binds are missing (Docker `appbuild` has no BROS_HOST_DATA_DIR).
 */
export function shouldRunAutostart(prerender = nitroIsPrerender()) {
  if (prerender) return false
  if (!process.env.BROS_HOST_DATA_DIR?.trim()) return false
  return true
}

export async function pullDockerAppImages(id: string) {
  const dockerApp = getDockerApp(id)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: 'DockerApp not found' })
  if (dockerApp.error) throw createError({ statusCode: 400, statusMessage: dockerApp.error })
  const name = projectName(id)
  const res = await run(
    'docker',
    ['compose', '-p', name, '-f', join(dockerApp.dir, 'docker-compose.yml'), 'pull'],
    dockerApp.dir,
    600_000,
  )
  if (res.code !== 0) {
    throw createError(dockerCommandError(500, 'Failed to pull docker app images', res.stderr || res.stdout || 'Failed to pull docker app images'))
  }
}

export function containerNameConflict(text: string): string | null {
  const match = text.match(/container name "\/?([^"]+)" is already in use/i)
  return match?.[1] || null
}

const startJobs = new Map<string, Promise<unknown>>()

export async function pullDockerApp(id: string, opts?: { dryRun?: boolean }) {
  const dockerApp = getDockerApp(id)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: 'DockerApp not found' })
  const composePath = join(dockerApp.dir, 'docker-compose.yml')
  const compose = existsSync(composePath) ? readFileSync(composePath, 'utf8') : ''
  if (composeImageIsLocal(compose)) {
    if (opts?.dryRun) return { code: 0, stdout: '', stderr: '' }
    await startDockerApp(id, { rebuild: true, forceRecreate: true })
    return { code: 0, stdout: '', stderr: '' }
  }
  const pull = await run('docker', [
    'compose', '-p', projectName(id), '-f', composePath,
    'pull',
    ...(opts?.dryRun ? ['--dry-run'] : []),
  ], dockerApp.dir, 600_000)
  if (opts?.dryRun || pull.code !== 0) return pull
  await startDockerApp(id, { forceRecreate: true })
  return pull
}

export function startDockerApp(id: string, opts?: { forceRecreate?: boolean; rebuild?: boolean }) {
  if (!opts?.forceRecreate) {
    const existing = startJobs.get(id)
    if (existing) return existing as ReturnType<typeof runStartDockerApp>
  }
  const job = runStartDockerApp(id, opts)
  startJobs.set(id, job)
  return job.finally(() => {
    if (startJobs.get(id) === job) startJobs.delete(id)
  })
}

// shortcut: 3s desktop-up cache. Drop it if a stop must show in the stream on the next asset.
let desktopUpUntil = 0

export async function ensureAppsRunning() {
  if (Date.now() < desktopUpUntil) return
  desktopUpUntil = Date.now() + 3_000
}

async function runningContainerName(id: string): Promise<string> {
  const dockerApp = getDockerApp(id)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: 'DockerApp not found' })
  const service = dockerApp.interfaces.find((iface) => iface.service)?.service || dockerApp.id
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
  if (!name) throw createError({ statusCode: 500, statusMessage: 'DockerApp container is missing' })
  return name
}

export async function ensureDockerAppGui(id: string) {
  const dockerApp = getDockerApp(id)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: 'DockerApp not found' })
  const iface = dockerApp.interfaces.find((row) => row.type === 'gui' && row.command)
  if (!iface?.command) throw createError({ statusCode: 404, statusMessage: 'GUI app not found' })
  await ensureAppsRunning()
  const container = await runningContainerName(id)
  const cmd = iface.command
  const res = await execInBros(['/app/lib/desktop/desktop-gui.sh', 'start', id, '--container', container, '--', cmd])
  if (res.code !== 0) {
    throw createError(dockerCommandError(500, 'Desktop app failed to start', res.stderr || res.stdout || 'Desktop app failed to start'))
  }
}

async function guiScript(id: string, action: 'close' | 'stop') {
  if (!(await brosContainerRunning())) return
  const res = await execInBros(['/app/lib/desktop/desktop-gui.sh', action, id])
  if (res.code !== 0) {
    throw createError(dockerCommandError(500, 'Desktop app failed to stop', res.stderr || res.stdout || 'Desktop app failed to stop'))
  }
}

export function stopGuiSession(id: string) {
  return guiScript(id, 'stop')
}

export function closeGuiWindow(id: string) {
  return guiScript(id, 'close')
}

async function runStartDockerApp(id: string, opts?: { forceRecreate?: boolean; rebuild?: boolean }) {
  const dockerApp = getDockerApp(id)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: 'DockerApp not found' })
  if (dockerApp.error) throw createError({ statusCode: 400, statusMessage: dockerApp.error })
  startingDockerAppIds.add(id)
  try {
  const boot = loadBootstrapConfig()
  if (dockerApp.kind === 'core') {
    seedDockerAppData(dockerApp.dir, join(boot.dataDir, dockerApp.id))
    ensureHomeDirs(boot.dataDir, dockerApp.home || [])
  }
  if (id === 'omniroute') {
    process.env.OMNIROUTE_JWT_SECRET = ensureOmnirouteJwtSecret({
      dataDir: boot.dataDir,
      packDir: dockerApp.dir,
    })
  }
  const probed = await dockerAppRuntime(dockerApp)
  const startPort = !probed.status.running && !probed.settings.autostart
    ? await readPublishedPort(dockerApp, false)
    : probed
  if (startPort.portOccupied && !startPort.ours && startPort.hostPort) {
    throw createError({
      statusCode: 409,
      statusMessage: `Port ${startPort.hostPort} is already in use.`,
    })
  }
  await ensureNetwork()
  await ensureX11Volume()
  const name = projectName(id)
  const composeArgs = ['compose', '-p', name, '-f', join(dockerApp.dir, 'docker-compose.yml')]
  let forceRecreate = !!opts?.forceRecreate
  const hostData = hostDataDirForBinds()
  if (await dockerAppBindsNeedRecreate(name, hostData)) forceRecreate = true

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
      const gpuFile = join(dockerApp.dir, 'docker-compose.gpu.yml')
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

  const dockerfile = existsSync(join(dockerApp.dir, 'Dockerfile'))
  const imageRef = dockerfile ? composeImageRef(dockerApp.dir) : null
  const imageReady = imageRef ? (await run('docker', ['image', 'inspect', imageRef], dockerApp.dir, 15_000)).code === 0 : false
  const build = dockerfile && shouldBuildDockerAppImage(imageReady, !!opts?.rebuild)
  const upArgs = [
    ...composeArgs,
    'up',
    '-d',
    '--remove-orphans',
    ...(build ? ['--build'] : []),
    ...(forceRecreate ? ['--force-recreate'] : []),
  ]
  if (composeUsesDesktopNetns(dockerApp.dir)) {
    await ensureAppsRunning()
    const inspect = await run('docker', ['inspect', '-f', '{{.State.Running}}', 'bros'], dockerApp.dir, 15_000)
    if (inspect.code !== 0 || inspect.stdout.trim() !== 'true') {
      throw createError({ statusCode: 400, statusMessage: 'Desktop failed to start' })
    }
  }
  let up = await run(
    'docker',
    upArgs,
    dockerApp.dir,
    600_000,
  )
  const conflict = up.code !== 0 ? containerNameConflict(`${up.stderr || ''}\n${up.stdout || ''}`) : null
  if (conflict) {
    await run('docker', ['rm', '-f', conflict], dockerApp.dir, 60_000)
    up = await run('docker', upArgs, dockerApp.dir, 600_000)
  }
  let buildFailed = false
  if (up.code !== 0 && build && imageReady && /timeout|DeadlineExceeded|failed to resolve|failed to do request/i.test(`${up.stderr || ''}\n${up.stdout || ''}`)) {
    buildFailed = true
    up = await run('docker', upArgs.filter((arg) => arg !== '--build'), dockerApp.dir, 600_000)
  }
  if (up.code !== 0) {
    const taken = startPort.portOccupied && !startPort.ours && startPort.hostPort
      ? ` Port ${startPort.hostPort} is already in use.`
      : ''
    throw createError(dockerCommandError(
      500,
      'Failed to start docker app',
      `${up.stderr || up.stdout || 'Failed to start docker app'}${taken}`,
    ))
  }
  if (buildFailed) {
    throw new Error('Desktop image was not rebuilt. The previous image is still running.')
  }
  // Cursor shares Desktop's netns. Attaching it to `bros` fails and a force
  // disconnect can drop that namespace.
  if (shouldAttachProjectNetwork(dockerApp.dir)) {
    const d = getDocker()
    const containers = await d.listContainers({ all: true, filters: { label: [`com.docker.compose.project=${name}`] } })
    for (const c of containers) {
      const service = c.Labels?.['com.docker.compose.service'] || dockerApp.id
      const aliases = Array.from(new Set([service, dockerApp.id, dockerApp.packageSlug].filter(Boolean)))
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
  const status = await getProjectStatus(dockerApp)
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
  autostartFailed.delete(id)
  return {
    ...status,
    skipped: false,
  }
  }
  finally {
    startingDockerAppIds.delete(id)
  }
}

export async function dockerAppLogs(id: string, tail = 200) {
  const dockerApp = getDockerApp(id)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: 'DockerApp not found' })
  const name = projectName(id)
  const capped = Math.min(Math.max(tail, 1), 2000)
  const res = await run(
    'docker',
    ['compose', '-p', name, '-f', join(dockerApp.dir, 'docker-compose.yml'), 'logs', '--no-color', '--tail', String(capped)],
    dockerApp.dir,
    30_000,
  )
  return {
    id,
    project: name,
    logs: (res.stdout || res.stderr || '').trim(),
    error: res.code !== 0 ? (res.stderr || res.stdout || 'Failed to read logs') : undefined,
  }
}

export async function stopDockerApp(id: string) {
  const dockerApp = getDockerApp(id)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: 'DockerApp not found' })
  const name = projectName(id)
  if (dockerApp.interfaces.some((iface) => iface.type === 'gui')) {
    try {
      await stopGuiSession(id)
    } catch (err) {
      console.error('gui session stop failed', id, err)
    }
  }
  const res = await run(
    'docker',
    ['compose', '-p', name, '-f', join(dockerApp.dir, 'docker-compose.yml'), 'down', '--timeout', '10'],
    dockerApp.dir,
    60_000,
  )
  if (res.code !== 0) {
    throw createError(dockerCommandError(500, 'Failed to stop docker app', res.stderr || 'Failed to stop docker app'))
  }
  await refreshCliBridges()
  return getProjectStatus(dockerApp)
}

export async function restartDockerApp(id: string) {
  await stopDockerApp(id)
  return startDockerApp(id)
}

export function getDockerAppSetting(id: string) {
  const row = getDb().select().from(dockerAppSettings).where(eq(dockerAppSettings.dockerAppId, id)).get()
  return {
    autostart: id === CORE_DOCKER_APP_ID || id === WHISPER_DOCKER_APP_ID
      ? isCoreAppEnabled(id)
      : (row?.autostart ?? defaultDockerAppAutostart(id)),
    navPinned: row?.navPinned ?? false,
    hostMode: row?.hostMode === 'host' || row?.hostMode === 'docker' ? row.hostMode : 'auto',
    exposeHost: row?.exposeHost ?? true,
    hostProbePort: typeof row?.hostProbePort === 'number' && row.hostProbePort > 0 ? row.hostProbePort : null,
  }
}

export function setDockerAppSetting(id: string, patch: {
  autostart?: boolean
  navPinned?: boolean
  hostMode?: string
  exposeHost?: boolean
  hostProbePort?: number | null
}) {
  const current = getDockerAppSetting(id)
  const hostMode = patch.hostMode === 'host' || patch.hostMode === 'docker' || patch.hostMode === 'auto'
    ? patch.hostMode
    : current.hostMode
  const next = {
    dockerAppId: id,
    autostart: id === CORE_DOCKER_APP_ID
      ? true
      : id === WHISPER_DOCKER_APP_ID
        ? current.autostart
        : (patch.autostart ?? current.autostart),
    navPinned: patch.navPinned ?? current.navPinned,
    hostMode,
    exposeHost: patch.exposeHost ?? current.exposeHost,
    hostProbePort: id === CORE_DOCKER_APP_ID
      ? (patch.hostProbePort === undefined ? current.hostProbePort : patch.hostProbePort)
      : null,
  }
  const db = getDb()
  const existing = db.select().from(dockerAppSettings).where(eq(dockerAppSettings.dockerAppId, id)).get()
  if (existing) db.update(dockerAppSettings).set(next).where(eq(dockerAppSettings.dockerAppId, id)).run()
  else db.insert(dockerAppSettings).values(next).run()
  if (id === CORE_DOCKER_APP_ID && patch.hostProbePort !== undefined) {
    void import('./providers/ollamaHost').then((m) => m.resetOllamaHostCache())
  }
  return {
    dockerAppId: next.dockerAppId,
    autostart: next.autostart,
    navPinned: next.navPinned,
    hostMode: next.hostMode,
    exposeHost: next.exposeHost,
    hostProbePort: next.hostProbePort,
  }
}

export async function refreshCliBridges() {
  try {
    const { dockerApps } = discoverDockerApps()
    const running = new Set<string>()
    for (const s of dockerApps) {
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
      dockerApps: cliPacks(dockerApps),
      running,
      brosBinDir: join(loadBootstrapConfig().dataDir, 'home', '.local', 'app-bins'),
      hostBinDir,
      execBinDir,
    })
  }
  catch (err) {
    console.error('cli bridge sync failed', err)
  }
}

export async function autostartDockerApps() {
  try {
    if (!shouldRunAutostart()) return
    try {
      const { waitForDesktopSession } = await import('./desktopReady')
      const gaps = await waitForDesktopSession()
      if (!gaps) {
        const { queueDesktopEnsure } = await import('./cli/ensure')
        queueDesktopEnsure()
      }
    } catch (err) {
      console.error('desktop session ensure failed', err)
    }
    for (const id of [...autostartFailed.keys()]) {
      if (id !== CORE_DOCKER_APP_ID && id !== WHISPER_DOCKER_APP_ID) autostartFailed.delete(id)
    }
    const { dockerApps } = discoverDockerApps()
    const queue: DockerAppMeta[] = []
    for (const s of dockerApps) {
      if (s.error) continue
      if (s.id === CORE_DOCKER_APP_ID || s.id === WHISPER_DOCKER_APP_ID) {
        if (!isCoreAppEnabled(s.id)) continue
      }
      else if (!shouldAutostartDockerApp(s, getDockerAppSetting(s.id))) continue
      startingDockerAppIds.add(s.id)
      queue.push(s)
    }
    const first: DockerAppMeta[] = []
    const afterDesktop: DockerAppMeta[] = []
    for (const s of queue) (composeUsesDesktopNetns(s.dir) ? afterDesktop : first).push(s)
    await startQueued(first)
    await startQueued(afterDesktop)
    await refreshCliBridges()
  }
  finally {
    bootPending = false
  }
}

async function startQueued(queue: DockerAppMeta[]) {
  await Promise.all(queue.map(async (s) => {
    try {
      const runtime = await dockerAppRuntime(s)
      if (runtime.status.running || (runtime.portOccupied && !runtime.ours)) {
        startingDockerAppIds.delete(s.id)
        return
      }
      await startDockerApp(s.id)
    }
    catch (err) {
      markAutostartFailed(s.id, failureText(err))
      startingDockerAppIds.delete(s.id)
      console.error('autostart failed', s.id, err)
    }
  }))
}
