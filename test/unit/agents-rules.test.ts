import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('agents board rules', () => {
  let dataDir = ''

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-agents-'))
    process.env.BROS_DATA_DIR = dataDir
    process.env.BROS_WORKING_DIR = dataDir
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
  })

  afterEach(async () => {
    const { resetDbForTests } = await import('../../src/server/utils/db')
    resetDbForTests()
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('labels the inbox step', async () => {
    const { inboxStartLabel } = await import('../../src/server/utils/agents/rules')
    expect(inboxStartLabel(null)).toBe('start preflight')
    expect(inboxStartLabel('queued')).toBe('start preflight')
    expect(inboxStartLabel('planning')).toBe('start preflight')
    expect(inboxStartLabel('awaiting_approval')).toBe('start implement')
    expect(inboxStartLabel('implementing')).toBe('start implement')
    expect(inboxStartLabel('awaiting_pr')).toBe('start pr')
    expect(inboxStartLabel('failed')).toBe('start preflight')
  })

  it('does not run the agent before implement is approved', async () => {
    const { createJob, getJob, patchJob } = await import('../../src/server/utils/agents/store')
    const { approveImplement } = await import('../../src/server/utils/agents/loop')
    const job = createJob({ project: 'demo', issueNumber: 4, title: 'Fix the door', kind: 'fix' })
    await expect(approveImplement(job.id, { title: 'Fix the door', summary: 'Replace the hinge' })).rejects.toThrow(/not waiting/)
    expect(getJob(job.id)?.state).toBe('queued')

    patchJob(job.id, { state: 'awaiting_approval' })
    await expect(approveImplement(job.id, 'not json')).rejects.toThrow(/invalid/)
    expect(getJob(job.id)?.state).toBe('awaiting_approval')
  })

  it('keeps the job cwd inside the workspace repo', async () => {
    const { repoCwd, workspaceCloneScript } = await import('../../src/server/utils/agents/rules')
    expect(repoCwd('demo')).toBe('/home/bros/workspace/demo')
    expect(() => repoCwd('../etc')).toThrow(/invalid/)
    expect(() => repoCwd('a/b')).toThrow(/invalid/)
    const script = workspaceCloneScript('jasenmichael', 'worc-test', 'worc-test')
    expect(script).toBe("mkdir -p '/home/bros/workspace' && GIT_TERMINAL_PROMPT=0 git clone 'https://github.com/jasenmichael/worc-test.git' '/home/bros/workspace/worc-test' && chown -R bros:bros '/home/bros/workspace/worc-test' && { chown bros:bros '/home/bros/.git-credentials' '/home/bros/.gitconfig' || true; }")
    expect(script).not.toMatch(/token|@github\.com/)
    expect(() => workspaceCloneScript('a/b', 'worc-test', 'worc-test')).toThrow(/invalid/)
  })

  it('registers a project under workspace and remove leaves the directory', async () => {
    const { addAgentProject, listProjectRecords, removeAgentProject } = await import('../../src/server/utils/agents/store')
    const { listProjects } = await import('../../src/server/utils/agents/loop')
    const { resolveProjectCwd } = await import('../../src/server/utils/agents/rules')
    expect(resolveProjectCwd('app', '')).toBe('/home/bros/workspace/app')
    expect(resolveProjectCwd('app', '/home/me/dev/bros/data/home/workspace/app')).toBe('/home/bros/workspace/app')
    expect(() => resolveProjectCwd('app', '/etc/app')).toThrow(/Workspace/)
    const repo = join(dataDir, 'home', 'workspace', 'app')
    mkdirSync(repo, { recursive: true })
    writeFileSync(join(repo, 'keep.txt'), 'stay')
    addAgentProject({ fullName: 'acme/app', defaultBranch: 'main', path: '/home/bros/workspace/app' })
    const rows = await listProjects()
    expect(rows.map((row) => row.name)).toEqual(['app'])
    expect(rows[0]?.cwd).toBe('/home/bros/workspace/app')
    expect(rows[0]?.enabled).toBe(true)
    expect(() => addAgentProject({ fullName: 'other/app' })).toThrow(/already exists/)
    removeAgentProject('app')
    expect(listProjectRecords()).toEqual([])
    expect(existsSync(join(repo, 'keep.txt'))).toBe(true)
  })

  it('clears a failed job without deleting the repo directory', async () => {
    const { createJob, getJob, patchJob } = await import('../../src/server/utils/agents/store')
    const { clearJob } = await import('../../src/server/utils/agents/loop')
    const repo = join(dataDir, 'home', 'workspace', 'demo')
    mkdirSync(repo, { recursive: true })
    writeFileSync(join(repo, 'keep.txt'), 'stay')
    const job = createJob({ project: 'demo', issueNumber: 4, title: 'Fix the door', kind: 'fix' })
    patchJob(job.id, { state: 'failed', error: 'boom' })
    clearJob(job.id)
    expect(getJob(job.id)).toBeNull()
    expect(existsSync(join(repo, 'keep.txt'))).toBe(true)
  })

  it('defaults the runtime to Cursor and the PR base to staging', async () => {
    const { projectPrBase, readSettings, setProjectPrBase } = await import('../../src/server/utils/agents/store')
    const { pullPlan } = await import('../../src/server/utils/agents/rules')
    const settings = readSettings()
    expect(settings.runtime).toBe('cursor')
    expect(settings.autoPreflight).toBe(true)
    expect(settings.autoApprove).toBe(false)
    expect(settings.autoApprovePr).toBe(false)
    expect(settings.deleteBranch).toBe(true)
    expect(projectPrBase('demo')).toBe('staging')
    expect(setProjectPrBase('demo', 'main')).toBe('main')
    expect(setProjectPrBase('demo', 'other')).toBe('staging')
    expect(pullPlan('main', 'fix/door')).toEqual({
      job: { head: 'fix/door', base: 'main' },
      standing: null,
    })
    expect(pullPlan('staging', 'fix/door')).toEqual({
      job: { head: 'fix/door', base: 'staging' },
      standing: { head: 'staging', base: 'main' },
    })
  })

  it('opens a standing staging pull only when the PR base is staging', async () => {
    const { ensureStandingPull } = await import('../../src/server/utils/agents/github')
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push(`${init?.method || 'GET'} ${String(url)} ${init?.body || ''}`)
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ number: 2, html_url: 'https://github.com/acme/demo/pull/2' }), { status: 201 })
      }
      return new Response('[]', { status: 200 })
    }
    await ensureStandingPull('token', 'acme', 'demo', 'main', fetchImpl)
    expect(calls).toEqual([])
    await ensureStandingPull('token', 'acme', 'demo', 'staging', fetchImpl)
    expect(calls.some((line) => line.includes('"head":"staging"') && line.includes('"base":"main"'))).toBe(true)
    expect(calls.some((line) => line.includes('"base":"staging"'))).toBe(false)
  })

  it('replaces the stored token from the environment, and clear removes it', async () => {
    const { readSettings, saveSettings, seedGithubTokenFromEnv } = await import('../../src/server/utils/agents/store')
    const { syncGitCredentials } = await import('../../src/server/utils/agents/desktop')
    const home = join(dataDir, 'home')
    saveSettings({ githubToken: 'pastedtoken9999' })
    expect(seedGithubTokenFromEnv({})).toBe('pastedtoken9999')
    expect(seedGithubTokenFromEnv({ GH_TOKEN: 'from-gh-token' })).toBe('from-gh-token')
    expect(readSettings().githubToken).toBe('from-gh-token')
    expect(seedGithubTokenFromEnv({ GITHUB_TOKEN: 'from-github', GITHUB_PAT: 'from-pat' })).toBe('from-github')
    expect(seedGithubTokenFromEnv({ GITHUB_PAT: 'from-pat' })).toBe('from-pat')
    saveSettings({ githubToken: 'pastedtoken9999' })
    expect(seedGithubTokenFromEnv({})).toBe('pastedtoken9999')

    syncGitCredentials(readSettings().githubToken, home)
    const credPath = join(home, '.git-credentials')
    expect(readFileSync(credPath, 'utf8')).toContain(encodeURIComponent('pastedtoken9999'))
    expect(statSync(credPath).mode & 0o777).toBe(0o600)
    expect(readFileSync(join(home, '.gitconfig'), 'utf8')).toContain('helper = store')

    saveSettings({ githubTokenClear: true })
    expect(readSettings().githubToken).toBe('')
    syncGitCredentials('', home)
    expect(readFileSync(credPath, 'utf8')).not.toContain('github.com')
  })
})
