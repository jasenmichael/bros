import { describe, expect, it } from 'vitest'
import {
  addSidecarBusy,
  isSidecarBusy,
  isSidecarRowBusy,
  removeSidecarBusy,
  sidecarBusyKey,
} from '../../src/app/utils/sidecars/sidecarBusy'

describe('sidecarBusy', () => {
  it('tracks concurrent actions on different sidecars', () => {
    let busy = new Set<string>()
    busy = addSidecarBusy(busy, sidecarBusyKey('paperclip', 'start'))
    busy = addSidecarBusy(busy, sidecarBusyKey('octop', 'stop'))

    expect(isSidecarBusy(busy, 'paperclip', 'start')).toBe(true)
    expect(isSidecarBusy(busy, 'octop', 'stop')).toBe(true)
    expect(isSidecarRowBusy(busy, 'paperclip')).toBe(true)
    expect(isSidecarRowBusy(busy, 'octop')).toBe(true)
    expect(isSidecarBusy(busy, 'paperclip', 'stop')).toBe(false)
  })

  it('clears only the finished key', () => {
    let busy = addSidecarBusy(new Set(), sidecarBusyKey('paperclip', 'start'))
    busy = addSidecarBusy(busy, sidecarBusyKey('octop', 'restart'))
    busy = removeSidecarBusy(busy, sidecarBusyKey('octop', 'restart'))

    expect(isSidecarBusy(busy, 'paperclip', 'start')).toBe(true)
    expect(isSidecarBusy(busy, 'octop', 'restart')).toBe(false)
    expect(isSidecarRowBusy(busy, 'octop')).toBe(false)
  })

  it('rowBusy blocks sibling actions on the same sidecar', () => {
    const busy = addSidecarBusy(new Set(), sidecarBusyKey('paperclip', 'start'))
    expect(isSidecarRowBusy(busy, 'paperclip')).toBe(true)
    expect(isSidecarBusy(busy, 'paperclip', 'start')).toBe(true)
    expect(isSidecarBusy(busy, 'paperclip', 'stop')).toBe(false)
  })
})
