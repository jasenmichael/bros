import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let dataDir = ''

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'bros-pull-'))
  process.env.BROS_DATA_DIR = dataDir
  process.env.BROS_WORKING_DIR = dataDir
  const { resetDbForTests } = await import('../../src/server/utils/db')
  resetDbForTests()
  const { resetPullJobsForTests } = await import('../../src/server/utils/ollamaPullJobs')
  resetPullJobsForTests()
})

afterEach(async () => {
  const { resetPullJobsForTests } = await import('../../src/server/utils/ollamaPullJobs')
  resetPullJobsForTests()
  const { resetDbForTests } = await import('../../src/server/utils/db')
  resetDbForTests()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
})

describe('ollama pull jobs', () => {
  it('exposes persist payload keyed by providerId + model', async () => {
    const {
      applyPullProgress,
      createOrReusePullJob,
      listActivePullsByProvider,
      pullJobsPayload,
    } = await import('../../src/server/utils/ollamaPullJobs')
    createOrReusePullJob('ollama', 'tinyllama')
    applyPullProgress('ollama', 'tinyllama', { status: 'downloading', completed: 40, total: 100 })
    createOrReusePullJob('ollama-host', 'mistral')

    const payload = pullJobsPayload()
    expect(payload.jobs).toHaveLength(2)
    expect(payload.activePulls.ollama?.[0]).toMatchObject({
      providerId: 'ollama',
      model: 'tinyllama',
      phase: 'running',
      percent: 40,
      completed: 40,
      total: 100,
      status: 'downloading',
    })
    expect(payload.activePulls['ollama-host']?.[0]?.model).toBe('mistral')
    expect(pullJobsPayload('ollama').jobs).toHaveLength(1)
    expect(listActivePullsByProvider().ollama?.[0]?.model).toBe('tinyllama')
  })

  it('reuses a running job, queues a second model, and resumes a stopped one', async () => {
    const {
      createOrReusePullJob,
      getPullJob,
      stopPullJob,
    } = await import('../../src/server/utils/ollamaPullJobs')
    const first = createOrReusePullJob('ollama', 'tinyllama')
    expect(first.created).toBe(true)
    const again = createOrReusePullJob('ollama', 'tinyllama')
    expect(again.created).toBe(false)
    expect(getPullJob('ollama', 'tinyllama')?.phase).toBe('running')

    const queued = createOrReusePullJob('ollama', 'gemma3:12b')
    expect(queued.created).toBe(true)
    expect(queued.job.phase).toBe('queued')
    expect(getPullJob('ollama', 'gemma3:12b')?.status).toContain('Waiting')

    stopPullJob('ollama', 'tinyllama')
    expect(getPullJob('ollama', 'tinyllama')?.phase).toBe('stopped')
    expect(getPullJob('ollama', 'gemma3:12b')?.phase).toBe('running')

    const resume = createOrReusePullJob('ollama', 'tinyllama')
    expect(resume.created).toBe(true)
    expect(getPullJob('ollama', 'tinyllama')?.phase).toBe('queued')
  })

  it('stops a running runner via abort and drops the row on remove', async () => {
    const {
      createOrReusePullJob,
      getPullJob,
      removePullJob,
      runPullJob,
      stopPullJob,
    } = await import('../../src/server/utils/ollamaPullJobs')
    createOrReusePullJob('ollama', 'tinyllama')
    const run = runPullJob('ollama', 'tinyllama', async function* (signal) {
      yield { status: 'downloading', completed: 10, total: 100 }
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 5000)
        signal.addEventListener('abort', () => {
          clearTimeout(t)
          reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))
        })
      })
    })
    await new Promise((r) => setTimeout(r, 10))
    expect(stopPullJob('ollama', 'tinyllama')?.phase).toBe('stopped')
    await run
    expect(getPullJob('ollama', 'tinyllama')?.phase).toBe('stopped')
    expect(removePullJob('ollama', 'tinyllama')?.model).toBe('tinyllama')
    expect(getPullJob('ollama', 'tinyllama')).toBeNull()
  })

  it('clears done jobs after the model is installed', async () => {
    const {
      applyPullProgress,
      clearDonePullsForInstalled,
      createOrReusePullJob,
      getPullJob,
    } = await import('../../src/server/utils/ollamaPullJobs')
    createOrReusePullJob('ollama', 'tinyllama')
    applyPullProgress('ollama', 'tinyllama', { status: 'success' })
    expect(getPullJob('ollama', 'tinyllama')?.phase).toBe('done')
    clearDonePullsForInstalled('ollama', ['tinyllama'])
    expect(getPullJob('ollama', 'tinyllama')).toBeNull()
  })

  it('rehydrates incomplete jobs from SQLite after a memory reset', async () => {
    const jobs = await import('../../src/server/utils/ollamaPullJobs')
    jobs.createOrReusePullJob('ollama', 'tinyllama')
    jobs.applyPullProgress('ollama', 'tinyllama', { status: 'downloading', completed: 25, total: 100 })
    jobs.createOrReusePullJob('ollama', 'gemma3:12b')
    expect(jobs.getPullJob('ollama', 'gemma3:12b')?.phase).toBe('queued')

    jobs.resetPullJobsMemoryForTests()
    expect(jobs.getPullJob('ollama', 'tinyllama')).toMatchObject({
      model: 'tinyllama',
      phase: 'running',
      percent: 25,
      completed: 25,
    })
    expect(jobs.getPullJob('ollama', 'gemma3:12b')?.phase).toBe('queued')
  })
})
