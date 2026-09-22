import { eq } from 'drizzle-orm'
import { getDb, ollamaPullJobRows } from './db'
import type { PullProgressEvent } from './providers'

export type PullJobPhase = 'queued' | 'running' | 'stopped' | 'done'

export type PullJob = {
  providerId: string
  model: string
  status: string
  percent: number | null
  completed: number
  total: number
  error: string | null
  phase: PullJobPhase
  startedAt: number
}

type JobRecord = {
  job: PullJob
  controller: AbortController
  listeners: Set<(job: PullJob) => void>
}

const jobs = new Map<string, JobRecord>()
let hydrated = false

export function pullJobKey(providerId: string, model: string): string {
  return `${providerId}\n${model}`
}

export function snapshotPullJob(job: PullJob): PullJob {
  return { ...job }
}

function persistJob(job: PullJob) {
  try {
    const db = getDb()
    const id = pullJobKey(job.providerId, job.model)
    const row = {
      id,
      providerId: job.providerId,
      model: job.model,
      status: job.status,
      percent: job.percent,
      completed: job.completed,
      total: job.total,
      error: job.error,
      phase: job.phase,
      startedAt: job.startedAt,
    }
    const existing = db.select().from(ollamaPullJobRows).where(eq(ollamaPullJobRows.id, id)).get()
    if (existing) db.update(ollamaPullJobRows).set(row).where(eq(ollamaPullJobRows.id, id)).run()
    else db.insert(ollamaPullJobRows).values(row).run()
  }
  catch {
    // tests or missing dataDir
  }
}

function forgetPersistedJob(providerId: string, model: string) {
  try {
    getDb().delete(ollamaPullJobRows).where(eq(ollamaPullJobRows.id, pullJobKey(providerId, model))).run()
  }
  catch {
    // tests or missing dataDir
  }
}

export function hydratePullJobsFromDb() {
  if (hydrated) return
  hydrated = true
  try {
    const rows = getDb().select().from(ollamaPullJobRows).all()
    for (const row of rows) {
      if (jobs.has(row.id)) continue
      jobs.set(row.id, {
        job: {
          providerId: row.providerId,
          model: row.model,
          status: row.status,
          percent: row.percent,
          completed: row.completed,
          total: row.total,
          error: row.error,
          phase: row.phase as PullJobPhase,
          startedAt: row.startedAt,
        },
        controller: new AbortController(),
        listeners: new Set(),
      })
    }
  }
  catch {
    // tests or missing dataDir
  }
}

function ensureHydrated() {
  hydratePullJobsFromDb()
}

function providerHasRunning(providerId: string): boolean {
  for (const rec of jobs.values()) {
    if (rec.job.providerId === providerId && rec.job.phase === 'running') return true
  }
  return false
}

export function listPullJobs(): PullJob[] {
  ensureHydrated()
  return [...jobs.values()].map((rec) => snapshotPullJob(rec.job))
}

export function listActivePullsByProvider(): Record<string, PullJob[]> {
  ensureHydrated()
  const out: Record<string, PullJob[]> = {}
  for (const rec of jobs.values()) {
    const list = out[rec.job.providerId] || (out[rec.job.providerId] = [])
    list.push(snapshotPullJob(rec.job))
  }
  return out
}

export function pullJobsPayload(providerId?: string) {
  const all = listPullJobs()
  const jobsFor = providerId ? all.filter((job) => job.providerId === providerId) : all
  return {
    jobs: jobsFor,
    activePulls: listActivePullsByProvider(),
  }
}

export function getPullJob(providerId: string, model: string): PullJob | null {
  ensureHydrated()
  const rec = jobs.get(pullJobKey(providerId, model))
  return rec ? snapshotPullJob(rec.job) : null
}

export function subscribePullJob(providerId: string, model: string, listener: (job: PullJob) => void): () => void {
  ensureHydrated()
  const rec = jobs.get(pullJobKey(providerId, model))
  if (!rec) return () => {}
  rec.listeners.add(listener)
  return () => {
    rec.listeners.delete(listener)
  }
}

function emit(rec: JobRecord) {
  persistJob(rec.job)
  const snap = snapshotPullJob(rec.job)
  for (const listener of rec.listeners) listener(snap)
}

export function createOrReusePullJob(providerId: string, model: string): { job: PullJob; created: boolean } {
  ensureHydrated()
  const key = pullJobKey(providerId, model)
  const existing = jobs.get(key)
  if (existing && (existing.job.phase === 'running' || existing.job.phase === 'queued')) {
    return { job: snapshotPullJob(existing.job), created: false }
  }
  existing?.controller.abort()
  const queued = providerHasRunning(providerId)
  const rec: JobRecord = {
    job: {
      providerId,
      model,
      status: queued ? 'Waiting for current pull…' : 'Starting…',
      percent: queued ? existing?.job.percent ?? null : null,
      completed: queued ? existing?.job.completed ?? 0 : 0,
      total: queued ? existing?.job.total ?? 0 : 0,
      error: null,
      phase: queued ? 'queued' : 'running',
      startedAt: Date.now(),
    },
    controller: new AbortController(),
    listeners: new Set(),
  }
  jobs.set(key, rec)
  persistJob(rec.job)
  return { job: snapshotPullJob(rec.job), created: true }
}

export function getPullAbortSignal(providerId: string, model: string): AbortSignal | undefined {
  return jobs.get(pullJobKey(providerId, model))?.controller.signal
}

export function applyPullProgress(providerId: string, model: string, evt: PullProgressEvent) {
  const rec = jobs.get(pullJobKey(providerId, model))
  if (!rec || rec.job.phase !== 'running') return
  if (evt.error) {
    rec.job.error = evt.error
    rec.job.status = evt.error
    rec.job.phase = 'stopped'
    emit(rec)
    return
  }
  const total = Number(evt.total) || rec.job.total
  const completed = Number(evt.completed) || rec.job.completed
  rec.job.status = evt.status || rec.job.status
  rec.job.total = total
  rec.job.completed = completed
  rec.job.percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : rec.job.percent
  if (evt.status === 'success') {
    rec.job.phase = 'done'
    rec.job.status = 'Done'
    rec.job.percent = 100
  }
  emit(rec)
}

export function promoteQueuedJob(providerId: string): PullJob | null {
  if (providerHasRunning(providerId)) return null
  const next = [...jobs.values()]
    .filter((rec) => rec.job.providerId === providerId && rec.job.phase === 'queued')
    .sort((a, b) => a.job.startedAt - b.job.startedAt)[0]
  if (!next) return null
  next.controller = new AbortController()
  next.job.phase = 'running'
  next.job.status = next.job.status === 'Waiting for current pull…' ? 'Starting…' : next.job.status
  next.job.error = null
  emit(next)
  return snapshotPullJob(next.job)
}

export async function runPullJob(
  providerId: string,
  model: string,
  runner: (signal: AbortSignal) => AsyncGenerator<PullProgressEvent>,
): Promise<void> {
  const rec = jobs.get(pullJobKey(providerId, model))
  if (!rec) return
  try {
    for await (const evt of runner(rec.controller.signal)) {
      if (rec.controller.signal.aborted) break
      applyPullProgress(providerId, model, evt)
      if (rec.job.phase !== 'running') return
    }
    if (rec.controller.signal.aborted) {
      markStopped(rec)
      return
    }
    if (rec.job.phase === 'running' && !rec.job.error) {
      rec.job.phase = 'done'
      rec.job.status = 'Done'
      rec.job.percent = rec.job.percent ?? 100
      emit(rec)
    }
  }
  catch (err) {
    if (rec.controller.signal.aborted || isAbortError(err)) {
      markStopped(rec)
      return
    }
    rec.job.error = err instanceof Error ? err.message : String(err)
    rec.job.status = rec.job.error
    rec.job.phase = 'stopped'
    emit(rec)
  }
  finally {
    promoteQueuedJob(providerId)
  }
}

function markStopped(rec: JobRecord) {
  if (rec.job.phase === 'done') return
  rec.job.phase = 'stopped'
  rec.job.status = 'Stopped'
  rec.job.error = rec.job.error || null
  emit(rec)
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))
}

export function stopPullJob(providerId: string, model: string): PullJob | null {
  ensureHydrated()
  const rec = jobs.get(pullJobKey(providerId, model))
  if (!rec) return null
  if (rec.job.phase === 'running') {
    rec.controller.abort()
    markStopped(rec)
    const next = promoteQueuedJob(providerId)
    if (next) startPullRunner(next.providerId, next.model)
  } else if (rec.job.phase === 'queued') {
    markStopped(rec)
  }
  return snapshotPullJob(rec.job)
}

export function removePullJob(providerId: string, model: string): PullJob | null {
  ensureHydrated()
  const key = pullJobKey(providerId, model)
  const rec = jobs.get(key)
  if (!rec) return null
  const wasRunning = rec.job.phase === 'running'
  rec.controller.abort()
  jobs.delete(key)
  forgetPersistedJob(providerId, model)
  if (wasRunning) {
    const next = promoteQueuedJob(providerId)
    if (next) startPullRunner(next.providerId, next.model)
  }
  return snapshotPullJob(rec.job)
}

export function clearDonePullsForInstalled(providerId: string, installedNames: string[]) {
  ensureHydrated()
  const installed = new Set(installedNames)
  for (const [key, rec] of jobs) {
    if (rec.job.providerId === providerId && rec.job.phase === 'done' && installed.has(rec.job.model)) {
      jobs.delete(key)
      forgetPersistedJob(rec.job.providerId, rec.job.model)
    }
  }
}

export function startPullRunner(providerId: string, model: string) {
  if (process.env.VITEST) return
  const rec = jobs.get(pullJobKey(providerId, model))
  if (!rec || rec.job.phase !== 'running') return
  void (async () => {
    try {
      const { ollamaBaseUrlFor, pullOllamaModelStreamWithRetry } = await import('./providers')
      const baseUrl = await ollamaBaseUrlFor(providerId)
      await runPullJob(providerId, model, (signal) => pullOllamaModelStreamWithRetry(baseUrl, model, signal))
    }
    catch (err) {
      const live = jobs.get(pullJobKey(providerId, model))
      if (live && live.job.phase === 'running') {
        live.job.error = err instanceof Error ? err.message : String(err)
        live.job.status = live.job.error
        live.job.phase = 'stopped'
        emit(live)
        promoteQueuedJob(providerId)
      }
    }
    const next = [...jobs.values()].find((row) => (
      row.job.providerId === providerId && row.job.phase === 'running' && row.job.model !== model
    ))
    if (next) startPullRunner(next.job.providerId, next.job.model)
  })()
}

export function resumeInterruptedPulls() {
  ensureHydrated()
  const byProvider = new Map<string, JobRecord[]>()
  for (const rec of jobs.values()) {
    const list = byProvider.get(rec.job.providerId) || []
    list.push(rec)
    byProvider.set(rec.job.providerId, list)
  }
  for (const [providerId, recs] of byProvider) {
    const running = recs.filter((rec) => rec.job.phase === 'running').sort((a, b) => a.job.startedAt - b.job.startedAt)
    for (const extra of running.slice(1)) {
      extra.job.phase = 'queued'
      extra.job.status = 'Waiting for current pull…'
      emit(extra)
    }
    const head = running[0] || (() => {
      const promoted = promoteQueuedJob(providerId)
      return promoted ? jobs.get(pullJobKey(promoted.providerId, promoted.model)) : null
    })()
    if (head) startPullRunner(head.job.providerId, head.job.model)
  }
}

export function resetPullJobsMemoryForTests() {
  for (const rec of jobs.values()) rec.controller.abort()
  jobs.clear()
  hydrated = false
}

export function resetPullJobsForTests() {
  resetPullJobsMemoryForTests()
  try {
    getDb().delete(ollamaPullJobRows).run()
  }
  catch {
    // no db
  }
}

export function jobToNdjson(job: PullJob) {
  return {
    status: job.status,
    total: job.total,
    completed: job.completed,
    percent: job.percent,
    phase: job.phase,
    model: job.model,
    providerId: job.providerId,
    error: job.error || undefined,
    startedAt: job.startedAt,
  }
}
