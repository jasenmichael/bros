import { createError } from 'h3'

const OLLAMA_SIDECAR_ID = 'ollama'

export const OLLAMA_START_LOCKED_MESSAGE =
  'Ollama is a required core sidecar and always runs; start is not a UI action.'

export const OLLAMA_STOP_LOCKED_MESSAGE =
  'Ollama is a required core sidecar and cannot be stopped.'

export const OLLAMA_RESTART_LOCKED_MESSAGE =
  'Ollama is a required core sidecar and cannot be restarted from the UI.'

export const OLLAMA_AUTOSTART_LOCKED_MESSAGE =
  'Ollama always runs; autostart cannot be turned off.'

export const OLLAMA_HEALTH_DEBOUNCE_MS = 30_000

export type OllamaRestartReason = 'process-down' | 'probe-fail'

export type OllamaRestartNotice = {
  recoveredAt: string
  lastRestartReason: OllamaRestartReason
}

export type OllamaHealthInput = {
  running: boolean
  probeOk: boolean
  pullActive: boolean
}

export type OllamaRecoveryDecision = {
  action: 'none' | 'start' | 'restart'
  reason?: OllamaRestartReason
}

export function isMustRunSidecar(id: string): boolean {
  return id === OLLAMA_SIDECAR_ID
}

export function assertSidecarUiActionAllowed(id: string, action: 'start' | 'stop' | 'restart') {
  if (!isMustRunSidecar(id)) return
  const statusMessage = action === 'stop'
    ? OLLAMA_STOP_LOCKED_MESSAGE
    : action === 'start'
      ? OLLAMA_START_LOCKED_MESSAGE
      : OLLAMA_RESTART_LOCKED_MESSAGE
  throw createError({ statusCode: 400, statusMessage })
}

export function assertOllamaAutostartLocked(id: string, autostart?: boolean) {
  if (isMustRunSidecar(id) && autostart === false) {
    throw createError({
      statusCode: 400,
      statusMessage: OLLAMA_AUTOSTART_LOCKED_MESSAGE,
    })
  }
}

export function decideOllamaRecovery(input: OllamaHealthInput): OllamaRecoveryDecision {
  if (!input.running) return { action: 'start', reason: 'process-down' }
  if (!input.probeOk && !input.pullActive) return { action: 'restart', reason: 'probe-fail' }
  return { action: 'none' }
}

let notice: OllamaRestartNotice | null = null
let lastRestartMs = 0
let inFlight = false

export function peekOllamaRestartNotice(): OllamaRestartNotice | null {
  return notice
}

export function setOllamaRestartNotice(next: OllamaRestartNotice | null) {
  notice = next
}

export function resetOllamaHealthForTests() {
  notice = null
  lastRestartMs = 0
  inFlight = false
}

export type OllamaHealthDeps = {
  projectRunning: () => Promise<boolean>
  probeOk: () => Promise<boolean>
  pullActive: () => boolean
  start: () => Promise<unknown>
  restart: () => Promise<unknown>
}

export async function runOllamaHealthCheck(
  now = Date.now(),
  deps?: OllamaHealthDeps,
): Promise<OllamaRestartNotice | null> {
  if (inFlight) return null
  inFlight = true
  try {
    const resolved = deps || await defaultHealthDeps()
    const running = await resolved.projectRunning()
    const pullActive = resolved.pullActive()
    const probeOk = running ? await resolved.probeOk() : false
    const decision = decideOllamaRecovery({ running, probeOk, pullActive })
    if (decision.action === 'none' || !decision.reason) return null
    if (lastRestartMs && now - lastRestartMs < OLLAMA_HEALTH_DEBOUNCE_MS) return null
    if (decision.action === 'start') await resolved.start()
    else await resolved.restart()
    lastRestartMs = now
    notice = {
      recoveredAt: new Date(now).toISOString(),
      lastRestartReason: decision.reason,
    }
    return notice
  }
  finally {
    inFlight = false
  }
}

async function defaultHealthDeps(): Promise<OllamaHealthDeps> {
  const { getSidecar } = await import('./sidecars')
  const { getProjectStatus, startSidecar, restartSidecar } = await import('./docker')
  const { sidecarOllamaUrl } = await import('./ollamaHost')
  const { probeOllamaRunning } = await import('./providers')
  const { listPullJobs } = await import('./ollamaPullJobs')
  const sidecar = getSidecar(OLLAMA_SIDECAR_ID)
  return {
    async projectRunning() {
      if (!sidecar || sidecar.error) return false
      const status = await getProjectStatus(sidecar)
      return status.running
    },
    probeOk: () => probeOllamaRunning(sidecarOllamaUrl()),
    pullActive: () => listPullJobs().some((job) => job.providerId === OLLAMA_SIDECAR_ID && job.phase === 'running'),
    start: () => startSidecar(OLLAMA_SIDECAR_ID),
    restart: () => restartSidecar(OLLAMA_SIDECAR_ID),
  }
}
