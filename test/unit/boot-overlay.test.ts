import { describe, expect, it } from 'vitest'
import { bootOverlayVisible } from '../../src/layers/theme/app/utils/bootOverlay'

describe('boot overlay', () => {
  it('opens only while this process is still autostarting', () => {
    expect(bootOverlayVisible(null)).toBe(false)
    expect(bootOverlayVisible(undefined)).toBe(false)
    expect(bootOverlayVisible(null, true)).toBe(true)
    expect(bootOverlayVisible({ booting: true })).toBe(true)
    expect(bootOverlayVisible({ booting: false })).toBe(false)
    const laterStart = { booting: false, dockerApps: [{ autostart: true, phase: 'starting' }] }
    expect(bootOverlayVisible(laterStart)).toBe(false)
    expect(bootOverlayVisible({ booting: true }, false)).toBe(true)
  })
})
