import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('sidecar settings', () => {
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

  it('keeps ollama autostart on', async () => {
    const { getSidecarSetting, setSidecarSetting } = await import('../../src/server/utils/docker')
    expect(setSidecarSetting('ollama', { autostart: false }).autostart).toBe(true)
    expect(getSidecarSetting('ollama').autostart).toBe(true)
  })

  it('defaults expose-to-host on and keeps an explicit off', async () => {
    const { getSidecarSetting, setSidecarSetting } = await import('../../src/server/utils/docker')
    expect(getSidecarSetting('cursor').exposeHost).toBe(true)
    setSidecarSetting('cursor', { exposeHost: false })
    expect(getSidecarSetting('cursor').exposeHost).toBe(false)
    setSidecarSetting('cursor', { autostart: false })
    expect(getSidecarSetting('cursor').exposeHost).toBe(false)
  })

  it('persists Host Ollama manual port', async () => {
    const { getSidecarSetting, setSidecarSetting } = await import('../../src/server/utils/docker')
    setSidecarSetting('ollama', { hostProbePort: 22000 })
    expect(getSidecarSetting('ollama').hostProbePort).toBe(22000)
    setSidecarSetting('ollama', { hostProbePort: null })
    expect(getSidecarSetting('ollama').hostProbePort).toBeNull()
  })
})
