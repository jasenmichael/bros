import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { containerLogFile, logTailCount, rotateContainerLog, shouldRotateLog } from '../../src/server/utils/containerLogs'

describe('container logs', () => {
  it('names one file per service', () => {
    expect(containerLogFile('/logs', 'ollama', 'ollama')).toBe('/logs/ollama.log')
    expect(containerLogFile('/logs', 'redis', 'firecrawl')).toBe('/logs/firecrawl-redis.log')
    expect(containerLogFile('/logs', 'a/b', null)).toBe('/logs/a_b.log')
  })

  it('tails history only for an empty file', () => {
    expect(logTailCount(0)).toBe('200')
    expect(logTailCount(12)).toBe('0')
  })

  it('rotates at the limit and keeps one old file', () => {
    expect(shouldRotateLog(7, 8)).toBe(false)
    expect(shouldRotateLog(8, 8)).toBe(true)
    const dir = mkdtempSync(join(tmpdir(), 'bros-logs-'))
    const file = join(dir, 'ollama.log')
    writeFileSync(file, '12345678')
    expect(rotateContainerLog(file, 8)).toBe(true)
    expect(statSync(`${file}.1`).size).toBe(8)
    expect(rotateContainerLog(file, 8)).toBe(false)
  })
})
