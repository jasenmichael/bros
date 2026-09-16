import { spawn } from 'node:child_process'

export type GpuInfo = {
  available: boolean
  name?: string
  vramMb?: number
}

function runOnce(cmd: string, args: string[], timeoutMs = 20_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: process.env })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ code: 124, stdout, stderr: stderr || `timeout after ${timeoutMs}ms` })
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += String(d) })
    child.stderr.on('data', (d) => { stderr += String(d) })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: 1, stdout: '', stderr: err.message })
    })
  })
}

function parseSmi(stdout: string): GpuInfo {
  const line = stdout.trim().split('\n')[0] || ''
  if (!line) return { available: false }
  const [namePart, memPart] = line.split(',').map((s) => s.trim())
  const vramMb = memPart ? Number.parseInt(memPart, 10) : undefined
  return {
    available: true,
    name: namePart || 'NVIDIA GPU',
    vramMb: Number.isFinite(vramMb) ? vramMb : undefined,
  }
}

const SMI_ARGS = ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']

/**
 * Detect NVIDIA GPU. Tries host `nvidia-smi`, then Docker `--gpus all` via ollama image
 * (Bros runs in a container without GPU devices mounted).
 */
export async function detectGpu(): Promise<GpuInfo> {
  const local = await runOnce('nvidia-smi', SMI_ARGS, 5_000)
  if (local.code === 0 && local.stdout.trim()) return parseSmi(local.stdout)

  const uid = process.getuid?.() ?? 1000
  const gid = process.getgid?.() ?? 1000
  const viaDocker = await runOnce('docker', [
    'run', '--rm', '--user', `${uid}:${gid}`, '--gpus', 'all',
    '--entrypoint', 'nvidia-smi',
    'ollama/ollama:latest',
    ...SMI_ARGS,
  ], 45_000)
  if (viaDocker.code === 0 && viaDocker.stdout.trim()) return parseSmi(viaDocker.stdout)

  return { available: false }
}
