import { afterEach, describe, expect, it } from 'vitest'
import {
  dockerHostCandidates,
  firstPublishPort,
  hostUiUrl,
  isHostMode,
  resolveHostRuntime,
  setAppRunsInDockerForTests,
} from '../../src/server/utils/hostProbe'

describe('isHostMode', () => {
  it('accepts auto sidecar host only', () => {
    expect(isHostMode('auto')).toBe(true)
    expect(isHostMode('sidecar')).toBe(true)
    expect(isHostMode('host')).toBe(true)
    expect(isHostMode('other')).toBe(false)
  })
})

describe('dockerHostCandidates', () => {
  afterEach(() => {
    setAppRunsInDockerForTests(undefined)
  })

  it('uses 127.0.0.1 on host Node and skips host.docker.internal', () => {
    setAppRunsInDockerForTests(false)
    expect(dockerHostCandidates()).toEqual(['127.0.0.1', '172.17.0.1'])
  })

  it('uses host.docker.internal inside Docker', () => {
    setAppRunsInDockerForTests(true)
    expect(dockerHostCandidates()[0]).toBe('host.docker.internal')
    expect(dockerHostCandidates()).toContain('172.17.0.1')
  })
})

describe('firstPublishPort / hostUiUrl', () => {
  it('picks the first positive publish port', () => {
    expect(firstPublishPort([{ publish: 4097 }])).toBe(4097)
    expect(firstPublishPort([{}, { publish: 3080 }])).toBe(3080)
    expect(firstPublishPort([{ containerPort: 11434, publish: 11435 } as { publish?: number }])).toBe(11435)
    expect(firstPublishPort([])).toBeUndefined()
  })

  it('builds Open/Pin URLs on 127.0.0.1', () => {
    expect(hostUiUrl(3080)).toBe('http://127.0.0.1:3080/')
  })
})

describe('resolveHostRuntime', () => {
  it('auto + foreign occupant does not skip start', () => {
    expect(resolveHostRuntime({ hostMode: 'auto', portOccupied: true, ours: false })).toEqual({
      effectiveMode: 'sidecar',
      skipStart: false,
      warnPortTaken: true,
      hostManaged: false,
    })
  })

  it('auto + empty port starts sidecar', () => {
    expect(resolveHostRuntime({ hostMode: 'auto', portOccupied: false, ours: false })).toEqual({
      effectiveMode: 'sidecar',
      skipStart: false,
      warnPortTaken: false,
      hostManaged: false,
    })
  })

  it('auto + our project starts (idempotent up)', () => {
    expect(resolveHostRuntime({ hostMode: 'auto', portOccupied: true, ours: true })).toEqual({
      effectiveMode: 'sidecar',
      skipStart: false,
      warnPortTaken: false,
      hostManaged: false,
    })
  })

  it('host override always skips', () => {
    expect(resolveHostRuntime({ hostMode: 'host', portOccupied: false, ours: false }).skipStart).toBe(true)
    expect(resolveHostRuntime({ hostMode: 'host', portOccupied: false, ours: false }).hostManaged).toBe(true)
  })

  it('sidecar override starts and flags when port is taken by someone else', () => {
    expect(resolveHostRuntime({ hostMode: 'sidecar', portOccupied: true, ours: false })).toEqual({
      effectiveMode: 'sidecar',
      skipStart: false,
      warnPortTaken: true,
      hostManaged: false,
    })
  })
})
