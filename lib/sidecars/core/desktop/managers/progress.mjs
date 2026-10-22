import { spawn } from 'node:child_process'
import { writeSync } from 'node:fs'

// spawnSync blocks this process, so the repeat has to be another process.
const beat = [
  "import { writeSync } from 'node:fs'",
  'const line = process.env.BROS_PULSE_LINE',
  'const ms = Number(process.env.BROS_PULSE_MS)',
  'const start = Date.now()',
  'setInterval(() => {',
  '  const sec = Math.max(1, Math.round((Date.now() - start) / 1000))',
  "  writeSync(1, line + ' ' + sec + 's\\n')",
  '}, ms)',
].join('\n')

export function pulse(line, ms = 5000) {
  writeSync(1, `${line}\n`)
  const child = spawn(process.execPath, ['--input-type=module', '-e', beat], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, BROS_PULSE_LINE: line, BROS_PULSE_MS: String(ms) },
  })
  let stopped = false
  const halt = () => {
    stopped = true
    child.kill()
  }
  child.on('spawn', () => {
    if (stopped) child.kill()
    else child.unref()
  })
  child.on('error', () => {})
  return halt
}

export function during(line, fn, ms) {
  const stop = pulse(line, ms)
  try {
    return fn()
  } finally {
    stop()
  }
}
