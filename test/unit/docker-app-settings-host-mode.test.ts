import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('dockerApp settings', () => {
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
    const { getDockerAppSetting, setDockerAppSetting } = await import('../../src/server/utils/docker')
    expect(setDockerAppSetting('ollama', { autostart: false }).autostart).toBe(true)
    expect(getDockerAppSetting('ollama').autostart).toBe(true)
  })

  it('defaults expose-to-host on and keeps an explicit off', async () => {
    const { getDockerAppSetting, setDockerAppSetting } = await import('../../src/server/utils/docker')
    expect(getDockerAppSetting('cursor').exposeHost).toBe(true)
    setDockerAppSetting('cursor', { exposeHost: false })
    expect(getDockerAppSetting('cursor').exposeHost).toBe(false)
    setDockerAppSetting('cursor', { autostart: false })
    expect(getDockerAppSetting('cursor').exposeHost).toBe(false)
  })

  it('persists Host Ollama manual port', async () => {
    const { getDockerAppSetting, setDockerAppSetting } = await import('../../src/server/utils/docker')
    setDockerAppSetting('ollama', { hostProbePort: 22000 })
    expect(getDockerAppSetting('ollama').hostProbePort).toBe(22000)
    setDockerAppSetting('ollama', { hostProbePort: null })
    expect(getDockerAppSetting('ollama').hostProbePort).toBeNull()
  })
})
