import { describe, expect, it } from 'vitest'
import {
  firstHostPort,
  hostUiUrl,
  isHostMode,
  resolveHostRuntime,
} from '../../src/server/utils/hostProbe'

describe('isHostMode', () => {
  it('accepts auto sidecar host only', () => {
    expect(isHostMode('auto')).toBe(true)
    expect(isHostMode('sidecar')).toBe(true)
    expect(isHostMode('host')).toBe(true)
    expect(isHostMode('other')).toBe(false)
  })
})

describe('firstHostPort / hostUiUrl', () => {
  it('picks the first positive hostPort', () => {
    expect(firstHostPort([{ hostPort: 4096 }])).toBe(4096)
    expect(firstHostPort([{}, { hostPort: 3080 }])).toBe(3080)
    expect(firstHostPort([])).toBeUndefined()
  })

  it('builds Open/Pin URLs on 127.0.0.1', () => {
    expect(hostUiUrl(3080)).toBe('http://127.0.0.1:3080/')
  })
})

describe('resolveHostRuntime', () => {
  it('auto + foreign occupant is host-managed and skips start', () => {
    expect(resolveHostRuntime({ hostMode: 'auto', portOccupied: true, ours: false })).toEqual({
      effectiveMode: 'host',
      skipStart: true,
      warnPortTaken: false,
      hostManaged: true,
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

  it('sidecar override starts and warns when port is taken by someone else', () => {
    expect(resolveHostRuntime({ hostMode: 'sidecar', portOccupied: true, ours: false })).toEqual({
      effectiveMode: 'sidecar',
      skipStart: false,
      warnPortTaken: true,
      hostManaged: true,
    })
  })
})
