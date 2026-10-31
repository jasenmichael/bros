import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadBootstrapConfig } from '../config'
import { readSettings } from './store'

export function desktopHome(): string {
  return join(loadBootstrapConfig().dataDir, 'home')
}

export function syncGitCredentials(token: string, home = desktopHome()) {
  mkdirSync(home, { recursive: true })
  const credPath = join(home, '.git-credentials')
  let prior: string[] = []
  try {
    if (existsSync(credPath)) prior = readFileSync(credPath, 'utf8').split('\n')
  } catch {
    // Root-owned or otherwise unreadable file must not kill Nitro boot.
    prior = []
  }
  const kept = prior.filter((line) => line.trim() && !line.includes('github.com'))
  if (token) kept.push(`https://x-access-token:${encodeURIComponent(token)}@github.com`)
  try {
    writeFileSync(credPath, `${kept.join('\n')}${kept.length ? '\n' : ''}`, { mode: 0o600 })
    chmodSync(credPath, 0o600)
  } catch {
    return
  }
  const configPath = join(home, '.gitconfig')
  let config = ''
  try {
    if (existsSync(configPath)) config = readFileSync(configPath, 'utf8')
  } catch {
    return
  }
  if (!config.includes('helper = store')) {
    const next = `${config.trim()}\n[credential]\n\thelper = store\n`
    try {
      writeFileSync(configPath, next.startsWith('\n') ? next.slice(1) : next, { mode: 0o600 })
    } catch {
      // leave gitconfig alone when unwritable
    }
  }
}

export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function dockerArgs(input: { argv: string[], cwd?: string, env?: Record<string, string>, user?: string }): string[] {
  const args = ['exec', '-i', '-u', input.user || 'bros', '-e', 'HOME=/home/bros']
  for (const [key, value] of Object.entries(input.env || {})) {
    if (!/^[\w.-]+$/.test(key) || value.includes('\n') || value.includes('\0')) continue
    args.push('-e', `${key}=${value}`)
  }
  if (input.cwd) args.push('-w', input.cwd)
  args.push('bros', ...input.argv)
  return args
}

export function dockerExec(input: {
  argv: string[]
  cwd?: string
  env?: Record<string, string>
  stdin?: string
  timeoutMs?: number
  user?: string
}): Promise<{ code: number, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('docker', dockerArgs(input), { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, input.timeoutMs ?? 120_000)
    child.stdout.on('data', (buf: Buffer) => { stdout += String(buf) })
    child.stderr.on('data', (buf: Buffer) => { stderr += String(buf) })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: 1, stdout, stderr: stderr || err.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: timedOut ? 124 : (code ?? 1), stdout, stderr: timedOut ? 'timed out' : stderr })
    })
    if (input.stdin !== undefined) child.stdin.end(input.stdin)
    else child.stdin.end()
  })
}

export async function ensureCursorAgent(): Promise<void> {
  const probe = await dockerExec({
    argv: ['bash', '-lc', 'test -x "$HOME/.local/bin/cursor-agent"'],
    timeoutMs: 15_000,
  })
  if (probe.code === 0) return
  const install = await dockerExec({
    argv: ['bash', '-lc', 'curl -fsS https://cursor.com/install | bash'],
    timeoutMs: 180_000,
  })
  if (install.code !== 0) {
    throw new Error(install.stderr.trim() || 'cursor-agent install failed')
  }
}

export function cursorEnv(): Record<string, string> {
  const key = readSettings().cursorKey
  return key ? { CURSOR_API_KEY: key } : {}
}
