import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('desktop install progress', () => {
  it('flushes a heartbeat while the phase is still running', async () => {
    const child = spawn(process.execPath, [
      '--experimental-strip-types',
      '--input-type=module',
      '-e',
      `import { pulse } from './lib/desktop/managers/progress.ts'
pulse('cursor: download', 200)
setInterval(() => {}, 1e9)`,
    ], {
      cwd: root,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no heartbeat\n${out}\n${err}`)), 4000)
        child.stdout?.on('data', (buf: Buffer) => {
          out += buf.toString()
          if (/^cursor: download$/m.test(out) && /^cursor: download \d+s$/m.test(out)) {
            clearTimeout(timer)
            resolve()
          }
        })
        child.stderr?.on('data', (buf: Buffer) => { err += buf.toString() })
        child.on('error', (error) => {
          clearTimeout(timer)
          reject(error)
        })
        child.on('exit', () => {
          clearTimeout(timer)
          reject(new Error(`exited early\n${out}\n${err}`))
        })
      })
      expect(out).toMatch(/^cursor: download$/m)
      expect(out).toMatch(/^cursor: download \d+s$/m)
    } finally {
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL') } catch { /* already gone */ }
      }
    }
  })
})
