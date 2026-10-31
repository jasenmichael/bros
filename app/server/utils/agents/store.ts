import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { decryptSecret, encryptSecret } from '../auth'
import { agentApprovals, agentEvents, agentJobs, agentProjects, getDb, meta } from '../db'
import {
  maskSecret,
  parseDefaultBranch,
  parseOwnerName,
  parsePrBase,
  parseRuntime,
  parseTaskSpec,
  resolveProjectCwd,
  tokenFromEnv,
  type PrBase,
  type Runtime,
  type TaskSpec,
} from './rules'

const KEYS = {
  runtime: 'agent_runtime',
  cursorKey: 'agent_cursor_key',
  githubToken: 'agent_github_token',
  preflightModel: 'agent_preflight_model',
  autoPreflight: 'agent_auto_preflight',
  autoApprove: 'agent_auto_approve',
  autoApprovePr: 'agent_auto_approve_pr',
  deleteBranch: 'agent_delete_branch',
} as const

export type AgentSettings = {
  runtime: Runtime
  cursorKey: string
  githubToken: string
  preflightModel: string
  autoPreflight: boolean
  autoApprove: boolean
  autoApprovePr: boolean
  deleteBranch: boolean
}

export type JobRow = typeof agentJobs.$inferSelect

function readMeta(key: string): string {
  const row = getDb().select().from(meta).where(eq(meta.key, key)).get()
  return row?.value || ''
}

function writeMeta(key: string, value: string) {
  const db = getDb()
  const existing = db.select().from(meta).where(eq(meta.key, key)).get()
  if (existing) db.update(meta).set({ value }).where(eq(meta.key, key)).run()
  else db.insert(meta).values({ key, value }).run()
}

function readSecret(key: string): string {
  const raw = readMeta(key)
  if (!raw) return ''
  try {
    return decryptSecret(raw)
  }
  catch {
    return ''
  }
}

function writeSecret(key: string, value: string) {
  writeMeta(key, value ? encryptSecret(value) : '')
}

function flag(key: string, fallback: boolean): boolean {
  const raw = readMeta(key)
  if (!raw) return fallback
  return raw === '1'
}

export function readSettings(): AgentSettings {
  return {
    runtime: parseRuntime(readMeta(KEYS.runtime)),
    cursorKey: readSecret(KEYS.cursorKey),
    githubToken: readSecret(KEYS.githubToken),
    preflightModel: readMeta(KEYS.preflightModel),
    autoPreflight: flag(KEYS.autoPreflight, true),
    autoApprove: flag(KEYS.autoApprove, false),
    autoApprovePr: flag(KEYS.autoApprovePr, false),
    deleteBranch: flag(KEYS.deleteBranch, true),
  }
}

export function settingsView(settings = readSettings()) {
  return {
    runtime: settings.runtime,
    cursorKey: maskSecret(settings.cursorKey),
    githubToken: maskSecret(settings.githubToken),
    preflightModel: settings.preflightModel,
    autoPreflight: settings.autoPreflight,
    autoApprove: settings.autoApprove,
    autoApprovePr: settings.autoApprovePr,
    deleteBranch: settings.deleteBranch,
  }
}

export function saveSettings(patch: {
  runtime?: string
  cursorKey?: string
  githubToken?: string
  githubTokenClear?: boolean
  cursorKeyClear?: boolean
  preflightModel?: string
  autoPreflight?: boolean
  autoApprove?: boolean
  autoApprovePr?: boolean
  deleteBranch?: boolean
}) {
  if (patch.runtime !== undefined) writeMeta(KEYS.runtime, parseRuntime(patch.runtime))
  if (patch.cursorKeyClear) writeSecret(KEYS.cursorKey, '')
  else if (patch.cursorKey?.trim()) writeSecret(KEYS.cursorKey, patch.cursorKey.trim())
  if (patch.githubTokenClear) writeSecret(KEYS.githubToken, '')
  else if (patch.githubToken?.trim()) writeSecret(KEYS.githubToken, patch.githubToken.trim())
  if (patch.preflightModel !== undefined) writeMeta(KEYS.preflightModel, patch.preflightModel.trim())
  if (patch.autoPreflight !== undefined) writeMeta(KEYS.autoPreflight, patch.autoPreflight ? '1' : '0')
  if (patch.autoApprove !== undefined) writeMeta(KEYS.autoApprove, patch.autoApprove ? '1' : '0')
  if (patch.autoApprovePr !== undefined) writeMeta(KEYS.autoApprovePr, patch.autoApprovePr ? '1' : '0')
  if (patch.deleteBranch !== undefined) writeMeta(KEYS.deleteBranch, patch.deleteBranch ? '1' : '0')
  return readSettings()
}

/** Env replaces the stored token when one of the vars is set. Unset leaves a pasted token. */
export function seedGithubTokenFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const token = tokenFromEnv(env)
  if (!token) return readSettings().githubToken
  writeSecret(KEYS.githubToken, token)
  return token
}

export function projectPrBase(name: string): PrBase {
  const row = getDb().select().from(agentProjects).where(eq(agentProjects.name, name)).get()
  return parsePrBase(row?.prBase)
}

export function setProjectPrBase(name: string, prBase: string): PrBase {
  const base = parsePrBase(prBase)
  const db = getDb()
  const existing = db.select().from(agentProjects).where(eq(agentProjects.name, name)).get()
  if (existing) db.update(agentProjects).set({ prBase: base }).where(eq(agentProjects.name, name)).run()
  else db.insert(agentProjects).values({ name, prBase: base, createdAt: Date.now() }).run()
  return base
}

export type ProjectRecord = typeof agentProjects.$inferSelect

export function listProjectRecords(): ProjectRecord[] {
  return getDb().select().from(agentProjects).all().filter((row) => Boolean(row.fullName))
}

export function addAgentProject(input: { fullName: string, defaultBranch?: string, path?: string }): ProjectRecord {
  const parsed = parseOwnerName(input.fullName)
  if (!parsed) throw new Error('owner/name required')
  const path = resolveProjectCwd(parsed.name, input.path || '')
  const branch = parseDefaultBranch(input.defaultBranch)
  const db = getDb()
  const existing = db.select().from(agentProjects).where(eq(agentProjects.name, parsed.name)).get()
  if (existing?.fullName) throw new Error('project already exists')
  const row: ProjectRecord = {
    name: parsed.name,
    prBase: existing?.prBase || 'staging',
    createdAt: existing?.createdAt || Date.now(),
    fullName: `${parsed.owner}/${parsed.name}`,
    defaultBranch: branch,
    path,
    enabled: true,
    promotionUrl: existing?.promotionUrl || null,
  }
  if (existing) db.update(agentProjects).set(row).where(eq(agentProjects.name, parsed.name)).run()
  else db.insert(agentProjects).values(row).run()
  return row
}

export function updateAgentProject(name: string, patch: {
  defaultBranch?: string
  path?: string
  enabled?: boolean
  prBase?: string
}): ProjectRecord {
  const db = getDb()
  const existing = db.select().from(agentProjects).where(eq(agentProjects.name, name)).get()
  if (!existing?.fullName) throw new Error('project not found')
  const next: Partial<ProjectRecord> = {}
  if (patch.defaultBranch !== undefined) next.defaultBranch = parseDefaultBranch(patch.defaultBranch)
  if (patch.path !== undefined) next.path = resolveProjectCwd(name, patch.path)
  if (patch.enabled !== undefined) next.enabled = patch.enabled
  if (patch.prBase !== undefined) next.prBase = parsePrBase(patch.prBase)
  db.update(agentProjects).set(next).where(eq(agentProjects.name, name)).run()
  return db.select().from(agentProjects).where(eq(agentProjects.name, name)).get()!
}

export function removeAgentProject(name: string) {
  const db = getDb()
  const existing = db.select().from(agentProjects).where(eq(agentProjects.name, name)).get()
  if (!existing?.fullName) throw new Error('project not found')
  db.delete(agentProjects).where(eq(agentProjects.name, name)).run()
}

export function setProjectPromotion(name: string, url: string) {
  getDb().update(agentProjects).set({ promotionUrl: url }).where(eq(agentProjects.name, name)).run()
}

export function listJobs(): JobRow[] {
  return getDb().select().from(agentJobs).orderBy(desc(agentJobs.createdAt)).all()
}

export function latestJob(project: string, issueNumber: number): JobRow | null {
  return getDb().select().from(agentJobs)
    .where(and(eq(agentJobs.project, project), eq(agentJobs.issueNumber, issueNumber)))
    .orderBy(desc(agentJobs.createdAt))
    .get() || null
}

export function getJob(id: string): JobRow | null {
  return getDb().select().from(agentJobs).where(eq(agentJobs.id, id)).get() || null
}

export function createJob(input: { project: string, issueNumber: number, title: string, kind: string }): JobRow {
  const now = Date.now()
  const row = {
    id: randomUUID(),
    project: input.project,
    issueNumber: input.issueNumber,
    state: 'queued',
    kind: input.kind,
    title: input.title,
    branch: null,
    prNumber: null,
    prUrl: null,
    taskSpec: null,
    preflightModel: null,
    error: null,
    result: null,
    agent: readSettings().runtime,
    retryCount: 0,
    branchDeleted: false,
    createdAt: now,
    startedAt: null,
    completedAt: null,
  }
  getDb().insert(agentJobs).values(row).run()
  return row
}

export function patchJob(id: string, patch: Partial<Omit<JobRow, 'id' | 'project' | 'issueNumber' | 'createdAt'>>) {
  getDb().update(agentJobs).set(patch).where(eq(agentJobs.id, id)).run()
  return getJob(id)
}

export function deleteJob(id: string) {
  const db = getDb()
  db.delete(agentEvents).where(eq(agentEvents.jobId, id)).run()
  db.delete(agentApprovals).where(eq(agentApprovals.jobId, id)).run()
  db.delete(agentJobs).where(eq(agentJobs.id, id)).run()
}

export function addEvent(jobId: string, kind: string, message: string) {
  getDb().insert(agentEvents).values({
    id: randomUUID(),
    jobId,
    kind,
    message,
    createdAt: Date.now(),
  }).run()
}

export function listEvents(jobId: string) {
  return getDb().select().from(agentEvents).where(eq(agentEvents.jobId, jobId)).all()
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function addApproval(jobId: string, kind: string, status: string) {
  getDb().insert(agentApprovals).values({
    id: randomUUID(),
    jobId,
    kind,
    status,
    createdAt: Date.now(),
  }).run()
}

export function saveTaskSpec(id: string, spec: TaskSpec) {
  patchJob(id, { taskSpec: JSON.stringify(spec), title: spec.title, kind: spec.kind })
}

export function readTaskSpec(job: JobRow): TaskSpec | null {
  if (!job.taskSpec) return null
  return parseTaskSpec(job.taskSpec)
}
