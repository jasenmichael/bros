import { spawn } from 'node:child_process'
import { join } from 'node:path'
import Docker from 'dockerode'
import { eq } from 'drizzle-orm'
import { getDb, sidecarSettings } from './db'
import { firstHostPort, isHostMode, probeHostPort, resolveHostRuntime, type HostMode } from './hostProbe'
import { getSidecar, projectName, type SidecarMeta } from './sidecars'

const NETWORK = process.env.BROS_NETWORK || 'bros'

let docker: Docker | null = null

export function getDocker() {
  if (!docker) docker = new Docker({ socketPath: '/var/run/docker.sock' })
  return docker
}

function run(cmd: string, args: string[], cwd: string, timeoutMs = 120_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env })
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

export async function getProjectStatus(sidecar: SidecarMeta) {
  const name = projectName(sidecar.id)
  const result = await run('docker', ['compose', '-p', name, 'ps', '--format', 'json'], sidecar.dir)
  if (result.code !== 0) {
    return { project: name, running: false, services: [] as Array<{ name: string; state: string }> }
  }
  const lines = result.stdout.trim().split('\n').filter(Boolean)
  const services = lines.map((line) => {
    try {
      const row = JSON.parse(line)
      return { name: row.Service || row.Name, state: row.State || row.Status || 'unknown' }
    } catch {
      return { name: 'unknown', state: 'unknown' }
    }
  })
  const running = services.some((s) => String(s.state).toLowerCase().includes('running'))
  return { project: name, running, services }
}

export async function sidecarRuntime(sidecar: SidecarMeta) {
  const settings = getSidecarSetting(sidecar.id)
  const status = sidecar.error
    ? { project: projectName(sidecar.id), running: false, services: [] as Array<{ name: string; state: string }> }
    : await getProjectStatus(sidecar)
  const hostPort = firstHostPort(sidecar.interfaces)
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
  const runtime = resolveHostRuntime({
    hostMode: settings.hostMode,
    portOccupied,
    ours,
  })
  const warning = runtime.warnPortTaken && hostPort
    ? `Port ${hostPort} is in use by something other than ${projectName(sidecar.id)}.`
    : runtime.hostManaged && portOccupied && !ours && hostPort
      ? `Host-managed: something on port ${hostPort} is not ${projectName(sidecar.id)}.`
      : undefined
  return { settings, status, hostPort, portOccupied, ours, warning, ...runtime }
}

export async function startSidecar(id: string) {
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
  if (sidecar.error) throw createError({ statusCode: 400, statusMessage: sidecar.error })
  const probed = await sidecarRuntime(sidecar)
  if (probed.skipStart) {
    return {
      ...probed.status,
      hostMode: probed.settings.hostMode,
      effectiveMode: probed.effectiveMode,
      hostManaged: probed.hostManaged,
      skipped: true,
      warning: probed.settings.hostMode === 'host'
        ? `Skipped compose up: host mode.`
        : `Skipped compose up: host-managed (port ${probed.hostPort} answered by something other than ${projectName(id)}).`,
    }
  }
  await ensureNetwork()
  const name = projectName(id)
  const composeArgs = ['compose', '-p', name, '-f', join(sidecar.dir, 'docker-compose.yml')]
  let forceRecreate = false

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
  }

  const upArgs = forceRecreate
    ? [...composeArgs, 'up', '-d', '--remove-orphans', '--force-recreate']
    : [...composeArgs, 'up', '-d', '--remove-orphans']
  const up = await run(
    'docker',
    upArgs,
    sidecar.dir,
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
  return {
    ...status,
    hostMode: probed.settings.hostMode,
    effectiveMode: probed.effectiveMode,
    hostManaged: probed.hostManaged,
    skipped: false,
    warning: probed.warnPortTaken
      ? `Started sidecar while port ${probed.hostPort} was already in use.`
      : undefined,
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
    autostart: row?.autostart ?? false,
    navPinned: row?.navPinned ?? false,
    hostMode: (isHostMode(row?.hostMode) ? row.hostMode : 'auto') as HostMode,
  }
}

export function setSidecarSetting(id: string, patch: { autostart?: boolean; navPinned?: boolean; hostMode?: HostMode }) {
  const current = getSidecarSetting(id)
  const next = {
    sidecarId: id,
    autostart: patch.autostart ?? current.autostart,
    navPinned: patch.navPinned ?? current.navPinned,
    hostMode: patch.hostMode && isHostMode(patch.hostMode) ? patch.hostMode : current.hostMode,
  }
  const db = getDb()
  const existing = db.select().from(sidecarSettings).where(eq(sidecarSettings.sidecarId, id)).get()
  if (existing) db.update(sidecarSettings).set(next).where(eq(sidecarSettings.sidecarId, id)).run()
  else db.insert(sidecarSettings).values(next).run()
  return next
}

export async function autostartSidecars() {
  const { discoverSidecars } = await import('./sidecars')
  const { sidecars } = discoverSidecars()
  for (const s of sidecars) {
    if (s.error) continue
    const settings = getSidecarSetting(s.id)
    if (settings.autostart) {
      try {
        await startSidecar(s.id)
      } catch (err) {
        console.error('autostart failed', s.id, err)
      }
    }
  }
}
