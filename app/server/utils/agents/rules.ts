export const JOB_TIMEOUT_MS = 45 * 60 * 1000
export const IMPLEMENT_RETRIES = 2
export const AUTO_RETRY_MS = 60_000
export const DESKTOP_WORKSPACE = '/home/bros/workspace'

const ACTIVE = new Set([
  'queued',
  'planning',
  'awaiting_approval',
  'implementing',
  'committing',
  'awaiting_pr',
  'creating_pr',
])

const TERMINAL = new Set(['completed', 'failed', 'timed_out', 'cancelled'])

const KIND_FROM_LABEL: Record<string, string> = {
  bug: 'fix',
  fix: 'fix',
  feat: 'feat',
  feature: 'feat',
  enhancement: 'feat',
  docs: 'docs',
  doc: 'docs',
  documentation: 'docs',
  chore: 'chore',
  test: 'test',
  refactor: 'refactor',
  perf: 'perf',
  ci: 'ci',
}

export type PrBase = 'staging' | 'main'
export type Runtime = 'cursor' | 'claude'
export type InboxStep = 'preflight' | 'implement' | 'pr'

export type TaskSpec = {
  title: string
  kind: string
  summary: string
  steps: string[]
}

export function isActiveState(state: string): boolean {
  return ACTIVE.has(state)
}

export function isTerminalState(state: string): boolean {
  return TERMINAL.has(state)
}

export function validRepoName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)
}

export function repoCwd(name: string): string {
  if (!validRepoName(name)) throw new Error('invalid repo name')
  return `${DESKTOP_WORKSPACE}/${name}`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** First checkout into Workspace. No token in the command. Credential helper auths. */
export function workspaceCloneScript(owner: string, repo: string, name: string): string {
  if (!/^[\w.-]+$/.test(owner) || owner === '.' || owner === '..' || !validRepoName(repo)) {
    throw new Error('invalid GitHub repo')
  }
  const dest = repoCwd(name)
  const url = `https://github.com/${owner}/${repo}.git`
  const cred = '/home/bros/.git-credentials'
  const cfg = '/home/bros/.gitconfig'
  return `mkdir -p ${shellQuote(DESKTOP_WORKSPACE)} && GIT_TERMINAL_PROMPT=0 git clone ${shellQuote(url)} ${shellQuote(dest)} && chown -R bros:bros ${shellQuote(dest)} && { chown bros:bros ${shellQuote(cred)} ${shellQuote(cfg)} || true; }`
}

export function parseOwnerName(fullName: string): { owner: string, name: string } | null {
  const trimmed = fullName.trim()
  const slash = trimmed.indexOf('/')
  if (slash <= 0 || slash !== trimmed.lastIndexOf('/') || slash === trimmed.length - 1) return null
  const owner = trimmed.slice(0, slash)
  const name = trimmed.slice(slash + 1)
  if (!/^[\w.-]+$/.test(owner) || !validRepoName(name)) return null
  return { owner, name }
}

export function parseDefaultBranch(value: string | undefined | null): string {
  const branch = (value || 'main').trim() || 'main'
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(branch) || branch.includes('..')) {
    throw new Error('invalid default branch')
  }
  return branch
}

/** Empty path or a Workspace path for this repo. Anything else is rejected. No clone. */
export function resolveProjectCwd(name: string, path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '')
  if (!trimmed || trimmed === name || trimmed === repoCwd(name)) return repoCwd(name)
  const at = trimmed.lastIndexOf('/workspace/')
  if (at >= 0 && trimmed.slice(at + '/workspace/'.length) === name) return repoCwd(name)
  throw new Error('path must be a repo directory under Workspace')
}

export function parsePrBase(value: string | undefined | null): PrBase {
  return value === 'main' ? 'main' : 'staging'
}

export function parseRuntime(value: string | undefined | null): Runtime {
  return value === 'claude' ? 'claude' : 'cursor'
}

export function tokenFromEnv(env: NodeJS.ProcessEnv): string {
  return env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim() || env.GITHUB_PAT?.trim() || ''
}

export function maskSecret(value: string): { set: boolean, last4: string } {
  if (!value) return { set: false, last4: '' }
  return { set: true, last4: value.slice(-4) }
}

export function parseGithubRemote(url: string): { owner: string, name: string } | null {
  const trimmed = url.trim().replace(/\.git$/, '')
  const match = trimmed.match(/github\.com[:/]([^/]+)\/([^/]+)$/)
  const owner = match?.[1]
  const name = match?.[2]
  if (!owner || !name) return null
  return { owner, name }
}

export function issueKind(labels: string[], title: string): string {
  for (const raw of labels) {
    const name = raw.replace(/^type:/i, '').trim().toLowerCase()
    if (KIND_FROM_LABEL[name]) return KIND_FROM_LABEL[name]
  }
  const match = title.match(/^(feat|fix|bug|docs|doc|chore|test|refactor|perf|ci)(?:\([^)]+\))?:/i)
  if (!match?.[1]) return 'other'
  const key = match[1].toLowerCase()
  return KIND_FROM_LABEL[key] || key
}

export function issueBranch(kind: string, title: string): string {
  const stripped = title.replace(/^(feat|fix|docs|chore|test|refactor|perf|ci)(?:\([^)]+\))?:\s*/i, '')
  const slug = stripped.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'issue'
  const prefix = kind.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'feat'
  return `${prefix}/${slug}`
}

export function inboxStep(state?: string | null): InboxStep {
  if (state === 'awaiting_pr' || state === 'creating_pr') return 'pr'
  if (!state || state === 'queued' || state === 'planning' || isTerminalState(state)) return 'preflight'
  return 'implement'
}

export function inboxStartLabel(state?: string | null): string {
  return `start ${inboxStep(state)}`
}

export function pullPlan(base: PrBase, branch: string): {
  job: { head: string, base: PrBase }
  standing: { head: 'staging', base: 'main' } | null
} {
  return {
    job: { head: branch, base },
    standing: base === 'staging' ? { head: 'staging', base: 'main' } : null,
  }
}

export function startAllowed(state?: string | null): boolean {
  if (!state) return true
  return isTerminalState(state)
}

export function issueOnBoard(input: {
  state?: string | null
  prMerged?: boolean | null
  prOpen?: boolean | null
}): boolean {
  if (!input.state) return true
  if (isActiveState(input.state)) return true
  if (input.state === 'failed' || input.state === 'timed_out' || input.state === 'cancelled') return true
  if (input.state !== 'completed') return true
  if (input.prMerged) return false
  if (input.prOpen === false) return true
  return false
}

/** Planning lives in memory. After a restart the row is still planning and nothing else will touch it. */
export function resumeOrphanedPlanning(state: string | null | undefined, inFlight: boolean): boolean {
  return state === 'planning' && !inFlight
}

export function autoEnqueue(input: {
  state?: string | null
  completedAt?: number | null
  prMerged?: boolean | null
  prOpen?: boolean | null
  now: number
}): boolean {
  if (!issueOnBoard(input)) return false
  if (!input.state) return true
  if (isActiveState(input.state)) return false
  if (input.state === 'completed') return input.prOpen === false && !input.prMerged
  if (!input.completedAt) return false
  return input.now - input.completedAt >= AUTO_RETRY_MS
}

export function parseTaskSpec(raw: string): TaskSpec | null {
  try {
    const value = JSON.parse(raw) as Partial<TaskSpec>
    const title = String(value.title || '').trim()
    const summary = String(value.summary || '').trim()
    if (!title || !summary) return null
    const steps = Array.isArray(value.steps) ? value.steps.map((step) => String(step).trim()).filter(Boolean) : []
    const given = String(value.kind || '').trim().toLowerCase()
    const kind = KIND_FROM_LABEL[given] || (given === 'other' ? 'other' : issueKind([], title))
    return { title, kind, summary, steps }
  }
  catch {
    return null
  }
}

export function taskSpecText(spec: TaskSpec, issueNumber: number): string {
  const steps = spec.steps.map((step) => `- ${step}`).join('\n')
  return [
    `# ${spec.title}`,
    '',
    spec.summary,
    steps ? `\n${steps}` : '',
    '',
    `GitHub issue #${issueNumber}.`,
    'Do not commit, push, or open a pull request.',
  ].join('\n')
}

export function commitSubject(spec: TaskSpec): string {
  const title = spec.title.replace(/^(feat|fix|docs|chore|test|refactor|perf|ci)(?:\([^)]+\))?:\s*/i, '')
  return `${spec.kind}: ${title}`.slice(0, 120)
}
