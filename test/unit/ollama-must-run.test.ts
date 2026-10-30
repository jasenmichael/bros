import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertOllamaAutostartLocked,
  assertDockerAppUiActionAllowed,
  decideOllamaRecovery,
  OLLAMA_AUTOSTART_LOCKED_MESSAGE,
  OLLAMA_HEALTH_DEBOUNCE_MS,
  OLLAMA_PROBE_MISS_LIMIT,
  OLLAMA_START_LOCKED_MESSAGE,
  OLLAMA_RESTART_LOCKED_MESSAGE,
  OLLAMA_STOP_LOCKED_MESSAGE,
  WHISPER_UI_LOCKED_MESSAGE,
  peekOllamaRestartNotice,
  resetOllamaHealthForTests,
  runOllamaHealthCheck,
} from '../../src/server/utils/docker-app/ollamaMustRun'

describe('ollama must-run dockerApp', () => {
  afterEach(() => {
    resetOllamaHealthForTests()
  })

  it('rejects UI start, stop, and restart for ollama with 400', () => {
    try {
      assertDockerAppUiActionAllowed('ollama', 'start')
      expect.unreachable()
    }
    catch (err) {
      expect(err).toMatchObject({ statusCode: 400, statusMessage: OLLAMA_START_LOCKED_MESSAGE })
    }
    try {
      assertDockerAppUiActionAllowed('ollama', 'stop')
      expect.unreachable()
    }
    catch (err) {
      expect(err).toMatchObject({ statusCode: 400, statusMessage: OLLAMA_STOP_LOCKED_MESSAGE })
    }
    try {
      assertDockerAppUiActionAllowed('ollama', 'restart')
      expect.unreachable()
    }
    catch (err) {
      expect(err).toMatchObject({ statusCode: 400, statusMessage: OLLAMA_RESTART_LOCKED_MESSAGE })
    }
    try {
      assertDockerAppUiActionAllowed('whisper', 'start')
      expect.unreachable()
    }
    catch (err) {
      expect(err).toMatchObject({ statusCode: 400, statusMessage: WHISPER_UI_LOCKED_MESSAGE })
    }
    expect(() => assertDockerAppUiActionAllowed('opencode', 'stop')).not.toThrow()
    expect(() => assertDockerAppUiActionAllowed('openwebui', 'restart')).not.toThrow()
  })

  it('rejects turning ollama autostart off', () => {
    try {
      assertOllamaAutostartLocked('ollama', false)
      expect.unreachable()
    }
    catch (err) {
      expect(err).toMatchObject({ statusCode: 400, statusMessage: OLLAMA_AUTOSTART_LOCKED_MESSAGE })
    }
    expect(() => assertOllamaAutostartLocked('ollama', true)).not.toThrow()
    expect(() => assertOllamaAutostartLocked('opencode', false)).not.toThrow()
  })

  it('restarts only when the process is down or the version probe fails', () => {
    expect(decideOllamaRecovery({ running: false, probeOk: false, pullActive: false })).toEqual({
      action: 'start',
      reason: 'process-down',
    })
    expect(decideOllamaRecovery({ running: true, probeOk: false, pullActive: false })).toEqual({
      action: 'restart',
      reason: 'probe-fail',
    })
    expect(decideOllamaRecovery({ running: true, probeOk: false, pullActive: true })).toEqual({
      action: 'none',
    })
    expect(decideOllamaRecovery({ running: true, probeOk: true, pullActive: false })).toEqual({
      action: 'none',
    })
  })

  it('records one recovery notice and debounces a restart storm', async () => {
    const start = vi.fn(async () => {})
    const restart = vi.fn(async () => {})
    const deps = {
      projectRunning: async () => false,
      probeOk: async () => false,
      pullActive: () => false,
      start,
      restart,
    }
    const first = await runOllamaHealthCheck(1_000, deps)
    expect(first).toEqual({
      recoveredAt: new Date(1_000).toISOString(),
      lastRestartReason: 'process-down',
    })
    expect(peekOllamaRestartNotice()).toEqual(first)
    expect(start).toHaveBeenCalledTimes(1)
    expect(restart).not.toHaveBeenCalled()

    const duringDebounce = await runOllamaHealthCheck(1_000 + OLLAMA_HEALTH_DEBOUNCE_MS - 1, deps)
    expect(duringDebounce).toBeNull()
    expect(start).toHaveBeenCalledTimes(1)
    expect(peekOllamaRestartNotice()).toEqual(first)
  })

  it('does not start again until the debounce after a failed start', async () => {
    const start = vi.fn(async () => {
      throw new Error('WARNING: Error loading config file\nUsage:  docker [OPTIONS] COMMAND')
    })
    const deps = {
      projectRunning: async () => false,
      probeOk: async () => false,
      pullActive: () => false,
      start,
      restart: vi.fn(async () => {}),
    }
    await expect(runOllamaHealthCheck(1_000, deps)).rejects.toThrow(/config file/)
    expect(start).toHaveBeenCalledTimes(1)
    const during = await runOllamaHealthCheck(1_000 + 1_000, deps)
    expect(during).toBeNull()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('restarts a running dockerApp after two version probe misses', async () => {
    const start = vi.fn(async () => {})
    const restart = vi.fn(async () => {})
    const deps = {
      projectRunning: async () => true,
      probeOk: async () => false,
      pullActive: () => false,
      start,
      restart,
    }
    const first = await runOllamaHealthCheck(50_000, deps)
    expect(first).toBeNull()
    expect(restart).not.toHaveBeenCalled()
    const notice = await runOllamaHealthCheck(65_000, deps)
    expect(OLLAMA_PROBE_MISS_LIMIT).toBe(2)
    expect(notice).toEqual({
      recoveredAt: new Date(65_000).toISOString(),
      lastRestartReason: 'probe-fail',
    })
    expect(restart).toHaveBeenCalledTimes(1)
    expect(start).not.toHaveBeenCalled()
  })

  it('does not restart while the health check is paused', async () => {
    const start = vi.fn(async () => {})
    const restart = vi.fn(async () => {})
    const notice = await runOllamaHealthCheck(1_000, {
      projectRunning: async () => false,
      probeOk: async () => false,
      pullActive: () => false,
      start,
      restart,
      paused: () => true,
    })
    expect(notice).toBeNull()
    expect(start).not.toHaveBeenCalled()
    expect(restart).not.toHaveBeenCalled()
  })
})
