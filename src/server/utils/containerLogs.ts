import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync, renameSync, statSync, type WriteStream } from 'node:fs'
import { dirname, join } from 'node:path'

export const CONTAINER_LOG_ROTATE_BYTES = 5 * 1024 * 1024

export function containerLogFile(logsDir: string, service: string, sidecarId?: string | null) {
  const base = sidecarId && sidecarId !== service ? `${sidecarId}-${service}` : service
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'container'
  return join(logsDir, `${safe}.log`)
}

export function shouldRotateLog(size: number, limit = CONTAINER_LOG_ROTATE_BYTES) {
  return size >= limit
}

export function logTailCount(fileBytes: number) {
  return fileBytes > 0 ? '0' : '200'
}

/** Rename to `<file>.1` once the file is at the limit. Returns whether it rotated. */
export function rotateContainerLog(file: string, limit = CONTAINER_LOG_ROTATE_BYTES) {
  let size = 0
  try {
    size = statSync(file).size
  }
  catch {
    return false
  }
  if (!shouldRotateLog(size, limit)) return false
  renameSync(file, `${file}.1`)
  return true
}

/** Follow `docker logs` into `file`. Does not write the lines to this process stdout. */
export function followContainerLog(containerId: string, file: string): ChildProcess {
  mkdirSync(dirname(file), { recursive: true })
  let bytes = 0
  try {
    bytes = statSync(file).size
  }
  catch {
    // new file
  }
  const child = spawn('docker', ['logs', '-f', '--tail', logTailCount(bytes), containerId], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stream: WriteStream = createWriteStream(file, { flags: 'a' })
  const write = (chunk: Buffer) => {
    try {
      if (rotateContainerLog(file)) {
        stream.end()
        stream = createWriteStream(file, { flags: 'a' })
      }
    }
    catch {
      // rename raced with another writer
    }
    stream.write(chunk)
  }
  child.stdout?.on('data', write)
  child.stderr?.on('data', write)
  child.on('error', (err) => console.error('[bros] container logs', err))
  child.on('close', () => stream.end())
  child.unref()
  return child
}
