import { listOllamaModels } from '../providers'
import { dockerAppOllamaUrl } from '../providers/ollamaHost'
import { readCliPackages } from '../cli/packages'
import { runCursorAcp } from './acp'
import { cursorEnv, dockerExec, ensureCursorAgent, shQuote, syncGitCredentials } from './desktop'
import {
  deleteBranch,
  ensureStandingPull,
  githubUser,
  listOpenIssues,
  openPull,
  pullState,
  type GithubIssue,
} from './github'
import {
  autoEnqueue,
  commitSubject,
  IMPLEMENT_RETRIES,
  inboxStep,
  issueBranch,
  issueKind,
  issueOnBoard,
  JOB_TIMEOUT_MS,
  parseOwnerName,
  parseTaskSpec,
  pullPlan,
  repoCwd,
  resumeOrphanedPlanning,
  resolveProjectCwd,
  startAllowed,
  taskSpecText,
  workspaceCloneScript,
} from './rules'
import {
  addApproval,
  addEvent,
  createJob,
  deleteJob,
  getJob,
  latestJob,
  listEvents,
  listJobs,
  patchJob,
  listProjectRecords,
  readSettings,
  setProjectPromotion,
  readTaskSpec,
  saveSettings,
  saveTaskSpec,
  settingsView,
  type JobRow,
} from './store'

const running = new Set<string>()

const issueCache = new Map<string, { at: number, rows: GithubIssue[] }>()

async function openIssues(token: string, owner: string, repo: string): Promise<GithubIssue[]> {
  const key = `${owner}/${repo}`
  const hit = issueCache.get(key)
  // ponytail: 10s cache. Drop it if every poll must hit GitHub.
  if (hit && Date.now() - hit.at < 10_000) return hit.rows
  const rows = await listOpenIssues(token, owner, repo)
  issueCache.set(key, { at: Date.now(), rows })
  return rows
}

export async function listProjects() {
  return listProjectRecords().map((row) => {
    const parsed = parseOwnerName(row.fullName || '')
    let cwd = ''
    let error: string | null = parsed ? null : 'owner/name required'
    try {
      cwd = resolveProjectCwd(row.name, row.path || '')
    }
    catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    }
    return {
      name: row.name,
      cwd,
      path: row.path || cwd,
      prBase: row.prBase === 'main' ? 'main' as const : 'staging' as const,
      fullName: row.fullName,
      owner: parsed?.owner || null,
      repo: parsed?.name || null,
      defaultBranch: row.defaultBranch || 'main',
      enabled: row.enabled !== false,
      promotionUrl: row.promotionUrl,
      error,
    }
  })
}

async function ollamaSpec(model: string, issueTitle: string, issueNumber: number): Promise<string> {
  const base = dockerAppOllamaUrl()
  let res: Response
  try {
    res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{
          role: 'user',
          content: [
            'Write a task spec as JSON with keys title, kind, summary, steps.',
            'kind is feat, fix, docs, chore, test, refactor, perf, ci, or other.',
            'steps is an array of short strings. No markdown outside the JSON.',
            `Issue #${issueNumber}: ${issueTitle}`,
          ].join('\n'),
        }],
      }),
    })
  }
  catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error('Ollama timed out')
    }
    throw err
  }
  if (!res.ok) throw new Error(`Ollama ${res.status}`)
  const body = await res.json() as { message?: { content?: string } }
  return body.message?.content || ''
}

function jsonFromModel(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (fenced?.[1] || text).trim()
}

async function occupy(id: string, fn: () => Promise<void>) {
  if (running.has(id)) return
  running.add(id)
  try {
    await fn()
  }
  finally {
    running.delete(id)
  }
}

async function ensureWorkspaceRepo(name: string, owner: string, repo: string) {
  const dest = repoCwd(name)
  const ready = await dockerExec({
    argv: ['bash', '-lc', `test -d ${shQuote(`${dest}/.git`)}`],
    timeoutMs: 15_000,
  })
  if (ready.code === 0) return
  const occupied = await dockerExec({
    argv: ['bash', '-lc', `test -e ${shQuote(dest)}`],
    timeoutMs: 15_000,
  })
  if (occupied.code === 0) throw new Error(`${dest} is not a git repo`)
  syncGitCredentials(readSettings().githubToken)
  const cloned = await dockerExec({
    argv: ['bash', '-lc', workspaceCloneScript(owner, repo, name)],
    timeoutMs: 180_000,
    user: '0',
  })
  if (cloned.code !== 0) throw new Error(cloned.stderr.trim() || cloned.stdout.trim() || 'clone failed')
}

async function git(name: string, script: string) {
  const result = await dockerExec({
    argv: ['bash', '-lc', script],
    cwd: repoCwd(name),
    timeoutMs: 120_000,
  })
  if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || 'git failed')
  return result.stdout.trim()
}

async function runImplement(id: string) {
  const job = getJob(id)
  if (!job) return
  const settings = readSettings()
  const spec = readTaskSpec(job)
  if (!spec) throw new Error('task spec missing')
  const projects = await listProjects()
  const project = projects.find((row) => row.name === job.project)
  if (!project?.enabled || !project.owner || !project.repo) throw new Error(project?.error || 'project not found')
  const token = settings.githubToken
  if (!token) throw new Error('GitHub token is not set')
  const user = await githubUser(token)
  const base = project.defaultBranch || 'main'
  const branch = issueBranch(spec.kind, spec.title)
  await ensureWorkspaceRepo(job.project, project.owner, project.repo)
  const dirty = await git(job.project, 'git status --porcelain')
  if (dirty) throw new Error('repo has uncommitted changes')
  patchJob(id, { state: 'implementing', branch, agent: settings.runtime, startedAt: job.startedAt || Date.now(), error: null })
  addEvent(id, 'branch', branch)
  await git(job.project, `git fetch origin && git checkout -B ${shQuote(branch)} ${shQuote(`origin/${base}`)}`)
  const prompt = taskSpecText(spec, job.issueNumber)
  if (settings.runtime === 'claude') {
    const result = await dockerExec({
      argv: ['bash', '-lc', 'claude -p --dangerously-skip-permissions'],
      cwd: repoCwd(job.project),
      stdin: prompt,
      timeoutMs: JOB_TIMEOUT_MS,
    })
    addEvent(id, 'message', result.stdout.slice(0, 4000))
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'claude failed')
  }
  else {
    await ensureCursorAgent()
    await runCursorAcp({
      cwd: repoCwd(job.project),
      prompt,
      env: cursorEnv(),
      timeoutMs: JOB_TIMEOUT_MS,
      onEvent: (kind, message) => addEvent(id, kind, message),
    })
  }
  patchJob(id, { state: 'committing' })
  const subject = commitSubject(spec)
  try {
    await git(job.project, [
      'git add -A',
      'if git diff --cached --quiet; then echo NO_CHANGES; exit 3; fi',
      `git -c user.name=${shQuote(user.name)} -c user.email=${shQuote(user.email)} commit -m ${shQuote(subject)}`,
      `git push -u origin ${shQuote(branch)}`,
    ].join(' && '))
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('NO_CHANGES')) throw new Error('agent made no changes')
    throw error
  }
  patchJob(id, { state: 'awaiting_pr', error: null })
  addEvent(id, 'push', branch)
  if (readSettings().autoApprovePr) await runApprovePr(id)
}

async function failJob(id: string, error: unknown, state: 'failed' | 'timed_out' = 'failed') {
  const message = error instanceof Error ? error.message : String(error)
  patchJob(id, { state, error: message, completedAt: Date.now() })
  addEvent(id, 'error', message)
}

export async function runPreflight(id: string) {
  let implement = false
  await occupy(id, async () => {
    const job = getJob(id)
    if (!job || job.state !== 'queued') return
    const settings = readSettings()
    if (!settings.preflightModel) {
      await failJob(id, new Error('Pick a preflight model'))
      return
    }
    patchJob(id, { state: 'planning', preflightModel: settings.preflightModel, startedAt: Date.now(), error: null })
    try {
      const raw = jsonFromModel(await ollamaSpec(settings.preflightModel, job.title, job.issueNumber))
      const spec = parseTaskSpec(raw)
      if (!spec) throw new Error('PreFlight did not return a task spec')
      saveTaskSpec(id, spec)
      addEvent(id, 'spec', spec.title)
      const fresh = readSettings()
      if (fresh.autoPreflight || fresh.autoApprove) {
        addApproval(id, 'implement', 'auto')
        implement = true
      }
      else {
        patchJob(id, { state: 'awaiting_approval' })
      }
    }
    catch (error) {
      const timedOut = error instanceof Error && error.message.includes('timed out')
      await failJob(id, error, timedOut ? 'timed_out' : 'failed')
    }
  })
  if (implement) void occupy(id, () => attemptImplement(id))
}

export async function approveImplement(id: string, rawSpec: unknown) {
  const job = getJob(id)
  if (!job || job.state !== 'awaiting_approval') throw new Error('job is not waiting for implement')
  const spec = parseTaskSpec(typeof rawSpec === 'string' ? rawSpec : JSON.stringify(rawSpec))
  if (!spec) throw new Error('task spec is invalid')
  saveTaskSpec(id, spec)
  addApproval(id, 'implement', 'approved')
  patchJob(id, { state: 'queued', error: null })
  void occupy(id, () => attemptImplement(id))
  return getJob(id)
}

async function attemptImplement(id: string) {
  let attempt = 0
  while (attempt <= IMPLEMENT_RETRIES) {
    try {
      await runImplement(id)
      return
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('timed out')) {
        await failJob(id, error, 'timed_out')
        return
      }
      if (message === 'agent made no changes' || getJob(id)?.state !== 'implementing') {
        await failJob(id, error)
        return
      }
      attempt += 1
      patchJob(id, { retryCount: attempt, state: 'queued' })
      if (attempt > IMPLEMENT_RETRIES) {
        await failJob(id, error)
        return
      }
      addEvent(id, 'retry', message)
    }
  }
}

export async function runApprovePr(id: string) {
  const job = getJob(id)
  if (!job || (job.state !== 'awaiting_pr' && job.state !== 'creating_pr')) throw new Error('job is not waiting for a PR')
  const projects = await listProjects()
  const project = projects.find((row) => row.name === job.project)
  if (!project?.owner || !project.repo || !job.branch) throw new Error('project not found')
  const token = readSettings().githubToken
  if (!token) throw new Error('GitHub token is not set')
  patchJob(id, { state: 'creating_pr' })
  const spec = readTaskSpec(job)
  const plan = pullPlan(project.prBase, job.branch)
  const pull = await openPull({
    token,
    owner: project.owner,
    repo: project.repo,
    title: spec?.title || job.title,
    head: plan.job.head,
    base: plan.job.base,
    body: `Fixes #${job.issueNumber}`,
  })
  if (plan.standing) {
    const standing = await ensureStandingPull(token, project.owner, project.repo, plan.job.base)
    if (standing?.url) setProjectPromotion(project.name, standing.url)
  }
  patchJob(id, {
    state: 'completed',
    prNumber: pull.number,
    prUrl: pull.url,
    result: `PR #${pull.number}`,
    completedAt: Date.now(),
    error: null,
  })
  addApproval(id, 'pr', 'approved')
  addEvent(id, 'pr', pull.url)
}

export function cancelJob(id: string) {
  const job = getJob(id)
  if (!job || !['awaiting_approval', 'awaiting_pr', 'queued', 'planning'].includes(job.state)) {
    throw new Error('job cannot be cancelled')
  }
  patchJob(id, { state: 'cancelled', completedAt: Date.now() })
  addEvent(id, 'cancel', 'cancelled')
}

export async function startIssue(project: string, issueNumber: number) {
  const projects = await listProjects()
  const row = projects.find((item) => item.name === project)
  if (!row?.owner || !row.repo) throw new Error(row?.error || 'project not found')
  const token = readSettings().githubToken
  if (!token) throw new Error('GitHub token is not set')
  const issues = await listOpenIssues(token, row.owner, row.repo)
  const issue = issues.find((item) => item.number === issueNumber)
  if (!issue) throw new Error('issue not found')
  const latest = latestJob(project, issueNumber)
  if (latest && !startAllowed(latest.state)) throw new Error('job already open')
  if (latest?.state === 'completed') {
    const pull = latest.prNumber ? await pullState(token, row.owner, row.repo, latest.prNumber) : null
    if (!issueOnBoard({ state: latest.state, prMerged: pull?.merged, prOpen: pull?.open })) {
      throw new Error('issue is already done')
    }
  }
  const job = createJob({
    project,
    issueNumber,
    title: issue.title,
    kind: issueKind(issue.labels, issue.title),
  })
  void runPreflight(job.id)
  return job
}

export async function board() {
  const settings = readSettings()
  const projects = await listProjects().catch(() => [])
  const jobs = listJobs()
  const issues = []
  const errors: { fullName: string, error: string }[] = []
  for (const project of projects) {
    if (!project.enabled) continue
    if (!project.owner || !project.repo) {
      if (project.error) errors.push({ fullName: project.name, error: project.error })
      continue
    }
    if (!settings.githubToken) {
      errors.push({ fullName: project.fullName || project.name, error: 'GitHub token is not set' })
      continue
    }
    try {
      const rows = await openIssues(settings.githubToken, project.owner, project.repo)
      for (const issue of rows) {
        const latest = latestJob(project.name, issue.number)
        let prMerged: boolean | null = null
        let prOpen: boolean | null = null
        if (latest?.prNumber) {
          const pull = await pullState(settings.githubToken, project.owner, project.repo, latest.prNumber).catch(() => null)
          prMerged = pull ? pull.merged : null
          prOpen = pull ? pull.open : null
        }
        if (!issueOnBoard({ state: latest?.state, prMerged, prOpen })) continue
        issues.push({
          project: project.name,
          fullName: project.fullName,
          number: issue.number,
          title: issue.title,
          kind: issueKind(issue.labels, issue.title),
          jobId: latest?.id || null,
          jobState: latest?.state || null,
          step: inboxStep(latest?.state),
          branch: latest?.branch || null,
          prUrl: latest?.prUrl || null,
        })
      }
    }
    catch (error) {
      errors.push({
        fullName: project.fullName || project.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  let models: string[] = []
  try {
    const listed = await listOllamaModels(dockerAppOllamaUrl())
    models = listed.map((row) => row.name)
  }
  catch {
    models = []
  }
  let apps = { cursor: false, claude: false }
  try {
    const packages = readCliPackages()
    apps = {
      cursor: packages.some((pkg) => pkg.id === 'cursor' && pkg.enabled),
      claude: packages.some((pkg) => pkg.id === 'claude' && pkg.enabled),
    }
  }
  catch {
    apps = { cursor: false, claude: false }
  }
  return {
    ...settingsView(settings),
    models,
    apps,
    workspace: '/home/bros/workspace',
    projects,
    issues,
    jobs: jobs.map((job) => ({
      ...job,
      taskSpec: readTaskSpec(job),
    })),
    errors,
  }
}

async function sweep() {
  syncGitCredentials(readSettings().githubToken)
  const settings = readSettings()
  if (!settings.githubToken) return
  const projects = await listProjects()
  const now = Date.now()
  if (settings.autoPreflight) {
    for (const project of projects) {
      if (!project.enabled || !project.owner || !project.repo) continue
      const rows = await openIssues(settings.githubToken, project.owner, project.repo)
      for (const issue of rows) {
        const latest = latestJob(project.name, issue.number)
        let prOpen: boolean | null = null
        let prMerged: boolean | null = null
        if (latest?.prNumber) {
          const pull = await pullState(settings.githubToken, project.owner, project.repo, latest.prNumber).catch(() => null)
          prOpen = pull ? pull.open : null
          prMerged = pull ? pull.merged : null
        }
        if (!autoEnqueue({
          state: latest?.state,
          completedAt: latest?.completedAt,
          prMerged,
          prOpen,
          now,
        })) continue
        const job = createJob({
          project: project.name,
          issueNumber: issue.number,
          title: issue.title,
          kind: issueKind(issue.labels, issue.title),
        })
        await runPreflight(job.id)
      }
    }
  }
  for (const job of listJobs()) {
    if (resumeOrphanedPlanning(job.state, running.has(job.id))) {
      // #region agent log
      fetch('http://127.0.0.1:7605/ingest/96b79570-9183-497e-8dac-73f419b1ff97',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'db6d6f'},body:JSON.stringify({sessionId:'db6d6f',runId:'post-fix',hypothesisId:'B',location:'loop.ts:sweep',message:'requeue orphaned planning',data:{id:job.id,issue:job.issueNumber},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      patchJob(job.id, { state: 'queued' })
      job.state = 'queued'
    }
    if (job.state === 'queued') await runPreflight(job.id)
  }
  if (settings.deleteBranch) {
    for (const job of listJobs()) {
      if (job.state !== 'completed' || job.branchDeleted || !job.prNumber || !job.branch) continue
      const project = projects.find((row) => row.name === job.project)
      if (!project?.owner || !project.repo) continue
      const pull = await pullState(settings.githubToken, project.owner, project.repo, job.prNumber).catch(() => null)
      if (!pull?.merged) continue
      await deleteBranch(settings.githubToken, project.owner, project.repo, job.branch)
      patchJob(job.id, { branchDeleted: true })
      addEvent(job.id, 'branch', `deleted ${job.branch}`)
    }
  }
}

let pumping = false

export async function pump() {
  if (pumping) return
  pumping = true
  try {
    await sweep()
  }
  catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7605/ingest/96b79570-9183-497e-8dac-73f419b1ff97',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'db6d6f'},body:JSON.stringify({sessionId:'db6d6f',runId:'post-fix',hypothesisId:'C',location:'loop.ts:pump',message:'sweep threw',data:{line:error instanceof Error?error.message.split('\n')[0]:String(error)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    console.error('[bros] agents', error instanceof Error ? error.message.split('\n')[0] : error)
  }
  finally {
    pumping = false
  }
}

export function startAgentLoop() {
  setTimeout(() => { void pump() }, 5_000).unref?.()
  setInterval(() => { void pump() }, 30_000).unref?.()
}

export function jobEvents(id: string) {
  return listEvents(id)
}

export function clearJob(id: string) {
  const job = getJob(id)
  if (!job) throw new Error('job not found')
  if (!['failed', 'timed_out', 'cancelled'].includes(job.state)) throw new Error('job cannot be cleared')
  deleteJob(id)
}
