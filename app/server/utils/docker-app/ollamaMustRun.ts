import { createError } from 'h3'

const OLLAMA_DOCKER_APP_ID = 'ollama'

export const OLLAMA_START_LOCKED_MESSAGE =
  'Ollama is a required core docker app and always runs; start is not a UI action.'

export const OLLAMA_STOP_LOCKED_MESSAGE =
  'Ollama is a required core docker app and cannot be stopped.'

export const OLLAMA_RESTART_LOCKED_MESSAGE =
  'Ollama is a required core docker app and cannot be restarted from the UI.'

export const OLLAMA_AUTOSTART_LOCKED_MESSAGE =
  'Ollama always runs; autostart cannot be turned off.'

export const WHISPER_UI_LOCKED_MESSAGE =
  'Enable Whisper in Settings. Start, stop, and restart are not docker app actions.'

export const OLLAMA_HEALTH_DEBOUNCE_MS = 30_000
export const OLLAMA_HEALTH_PROBE_MS = 5_000
export const OLLAMA_PROBE_MISS_LIMIT = 2

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

export function isMustRunDockerApp(id: string): boolean {
  return id === OLLAMA_DOCKER_APP_ID
}

export function assertDockerAppUiActionAllowed(id: string, action: 'start' | 'stop' | 'restart') {
  if (id === 'whisper') {
    throw createError({ statusCode: 400, statusMessage: WHISPER_UI_LOCKED_MESSAGE })
  }
  if (!isMustRunDockerApp(id)) return
  const statusMessage = action === 'stop'
    ? OLLAMA_STOP_LOCKED_MESSAGE
    : action === 'start'
      ? OLLAMA_START_LOCKED_MESSAGE
      : OLLAMA_RESTART_LOCKED_MESSAGE
  throw createError({ statusCode: 400, statusMessage })
}

export function assertOllamaAutostartLocked(id: string, autostart?: boolean) {
  if (isMustRunDockerApp(id) && autostart === false) {
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
let probeMisses = 0

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
  probeMisses = 0
}

export type OllamaHealthDeps = {
  projectRunning: () => Promise<boolean>
  probeOk: () => Promise<boolean>
  pullActive: () => boolean
  start: () => Promise<unknown>
  restart: () => Promise<unknown>
  paused?: () => boolean
}

export async function runOllamaHealthCheck(
  now = Date.now(),
  deps?: OllamaHealthDeps,
): Promise<OllamaRestartNotice | null> {
  if (inFlight) return null
  inFlight = true
  try {
    const resolved = deps || await defaultHealthDeps()
    if (resolved.paused?.()) {
      probeMisses = 0
      return null
    }
    const running = await resolved.projectRunning()
    const pullActive = resolved.pullActive()
    const probeOk = running ? await resolved.probeOk() : false
    const decision = decideOllamaRecovery({ running, probeOk, pullActive })
    if (decision.action === 'none' || !decision.reason) {
      probeMisses = 0
      return null
    }
    if (decision.reason === 'probe-fail') {
      probeMisses += 1
      if (probeMisses < OLLAMA_PROBE_MISS_LIMIT) return null
    }
    if (lastRestartMs && now - lastRestartMs < OLLAMA_HEALTH_DEBOUNCE_MS) return null
    probeMisses = 0
    try {
      if (decision.action === 'start') await resolved.start()
      else await resolved.restart()
    }
    catch (err) {
      // Failed start must arm the same debounce. Otherwise a bad docker CLI retries every tick and dumps `docker --help`.
      lastRestartMs = now
      // #region agent log
      fetch('http://127.0.0.1:7605/ingest/96b79570-9183-497e-8dac-73f419b1ff97',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'db6d6f'},body:JSON.stringify({sessionId:'db6d6f',runId:'post-fix',hypothesisId:'A',location:'ollamaMustRun.ts:health',message:'ollama health start failed',data:{action:decision.action,line:err instanceof Error?err.message.split('\n')[0]:String(err)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw err
    }
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
  const { getDockerApp, projectName } = await import('./dockerApps')
  const { getProjectStatus, isDockerAppStarting, publishedPortOwner, servicesBootPending, startDockerApp, restartDockerApp } = await import('../docker')
  const { firstPublishPort } = await import('../hostProbe')
  const { dockerAppOllamaUrl } = await import('../providers/ollamaHost')
  const { probeOllamaRunning } = await import('../providers')
  const { listPullJobs } = await import('../providers/ollamaPullJobs')
  const dockerApp = getDockerApp(OLLAMA_DOCKER_APP_ID)
  return {
    async projectRunning() {
      if (!dockerApp || dockerApp.error) return false
      const status = await getProjectStatus(dockerApp)
      if (status.running) return true
      // ponytail: port owner counts as up. compose ps false-down + start() force-recreates a live 11434 bind.
      const ports = [firstPublishPort(dockerApp.interfaces), 11434]
      try {
        const name = projectName(OLLAMA_DOCKER_APP_ID)
        for (const port of ports) {
          if (typeof port !== 'number') continue
          const owner = await publishedPortOwner(port)
          if (owner?.project === name) return true
        }
      } catch {
        return false
      }
      return false
    },
    paused: () => servicesBootPending() || isDockerAppStarting(OLLAMA_DOCKER_APP_ID),
    probeOk: () => probeOllamaRunning(dockerAppOllamaUrl(), OLLAMA_HEALTH_PROBE_MS),
    pullActive: () => listPullJobs().some((job) => job.providerId === OLLAMA_DOCKER_APP_ID && job.phase === 'running'),
    start: () => startDockerApp(OLLAMA_DOCKER_APP_ID),
    restart: () => restartDockerApp(OLLAMA_DOCKER_APP_ID),
  }
}
