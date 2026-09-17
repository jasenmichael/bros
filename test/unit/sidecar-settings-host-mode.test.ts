import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('sidecar hostMode settings', () => {
  let dataDir = ''

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'bros-test-'))
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

  it('defaults to auto and persists host override', async () => {
    const { getSidecarSetting, setSidecarSetting } = await import('../../src/server/utils/docker')
    expect(getSidecarSetting('ollama').hostMode).toBe('auto')
    const next = setSidecarSetting('ollama', { hostMode: 'host' })
    expect(next.hostMode).toBe('host')
    expect(getSidecarSetting('ollama')).toEqual({
      autostart: false,
      navPinned: false,
      hostMode: 'host',
    })
  })
})
