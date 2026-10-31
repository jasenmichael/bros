import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export default defineEventHandler(async () => {
  const repo = process.env.BROS_HOST_REPO || process.cwd()
  let behind = 0
  let git = 'current'
  try {
    const { stdout } = await exec('git', ['-C', repo, 'rev-list', '--count', 'HEAD..@{u}'])
    behind = Number(stdout.trim()) || 0
    if (behind > 0) git = 'behind'
  }
  catch {
    git = 'no-upstream'
  }
  return { ok: behind === 0, git, behind }
})
