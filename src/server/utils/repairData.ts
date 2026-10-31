import { spawn } from 'node:child_process'
import { hostDataDirForBinds } from './config'

const NUM = /^\d+$/

function quote(arg: string) {
  return /^[A-Za-z0-9_./:@=-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`
}

export function dataRepairPlan() {
  const hostUid = process.env.BROS_HOST_UID?.trim() || ''
  const hostGid = process.env.BROS_HOST_GID?.trim() || ''
  let hostData = ''
  try {
    hostData = hostDataDirForBinds()
  }
  catch {
    hostData = ''
  }
  if (!NUM.test(hostUid) || !NUM.test(hostGid) || !hostData) {
    return { hostUid, hostGid, hostData, command: '', argv: null as string[] | null }
  }
  const argv = ['run', '--rm', '--user', '0', '-v', `${hostData}:/data`, 'alpine:3.20', 'chown', '-R', `${hostUid}:${hostGid}`, '/data']
  const command = ['docker', ...argv.map(quote)].join(' ')
  return { hostUid, hostGid, hostData, command, argv }
}

export function repairDataDir(): Promise<void> {
  const plan = dataRepairPlan()
  if (!plan.argv) {
    return Promise.reject(new Error('BROS_HOST_UID, BROS_HOST_GID, or BROS_DATA_DIR is unset'))
  }
  const argv = plan.argv
  return new Promise((resolve, reject) => {
    const child = spawn('docker', argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('timed out'))
    }, 600_000)
    child.stderr.on('data', (buf: Buffer) => { err += buf.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(err.trim() || `exit ${code}`))
    })
  })
}
