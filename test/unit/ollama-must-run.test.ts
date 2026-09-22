import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertOllamaAutostartLocked,
  assertSidecarUiActionAllowed,
  decideOllamaRecovery,
  OLLAMA_AUTOSTART_LOCKED_MESSAGE,
  OLLAMA_HEALTH_DEBOUNCE_MS,
  OLLAMA_START_LOCKED_MESSAGE,
  OLLAMA_RESTART_LOCKED_MESSAGE,
  OLLAMA_STOP_LOCKED_MESSAGE,
  peekOllamaRestartNotice,
  resetOllamaHealthForTests,
  runOllamaHealthCheck,
} from '../../src/server/utils/ollamaMustRun'

describe('ollama must-run sidecar', () => {
  afterEach(() => {
    resetOllamaHealthForTests()
  })

  it('rejects UI start, stop, and restart for ollama with 400', () => {
    try {
      assertSidecarUiActionAllowed('ollama', 'start')
      expect.unreachable()
    }
    catch (err) {
      expect(err).toMatchObject({ statusCode: 400, statusMessage: OLLAMA_START_LOCKED_MESSAGE })
    }
    try {
      assertSidecarUiActionAllowed('ollama', 'stop')
      expect.unreachable()
    }
    catch (err) {
      expect(err).toMatchObject({ statusCode: 400, statusMessage: OLLAMA_STOP_LOCKED_MESSAGE })
    }
    try {
      assertSidecarUiActionAllowed('ollama', 'restart')
      expect.unreachable()
    }
    catch (err) {
      expect(err).toMatchObject({ statusCode: 400, statusMessage: OLLAMA_RESTART_LOCKED_MESSAGE })
    }
    expect(() => assertSidecarUiActionAllowed('opencode', 'stop')).not.toThrow()
    expect(() => assertSidecarUiActionAllowed('openwebui', 'restart')).not.toThrow()
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

  it('restarts a running sidecar when the version probe fails', async () => {
    const start = vi.fn(async () => {})
    const restart = vi.fn(async () => {})
    const notice = await runOllamaHealthCheck(50_000, {
      projectRunning: async () => true,
      probeOk: async () => false,
      pullActive: () => false,
      start,
      restart,
    })
    expect(notice).toEqual({
      recoveredAt: new Date(50_000).toISOString(),
      lastRestartReason: 'probe-fail',
    })
    expect(restart).toHaveBeenCalledTimes(1)
    expect(start).not.toHaveBeenCalled()
  })
})
