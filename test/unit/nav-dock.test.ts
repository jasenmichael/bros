import { describe, expect, it } from 'vitest'
import {
  ICON_WIDTH,
  MAX_WIDTH,
  MIN_WIDTH,
  SNAP_TO_ICON,
  SNAP_TO_LABELS,
  clampLiveWidth,
  iconModeForWidth,
  labeledWidthFromLive,
} from '../../src/layers/theme/app/composables/useNavDock'

describe('nav dock snap', () => {
  it('snaps to icons below 80px and back to labels past 112px', () => {
    expect(SNAP_TO_ICON).toBe(80)
    expect(SNAP_TO_LABELS).toBe(112)
    expect(iconModeForWidth(79, false)).toBe(true)
    expect(iconModeForWidth(80, false)).toBe(false)
    expect(iconModeForWidth(111, true)).toBe(true)
    expect(iconModeForWidth(112, true)).toBe(false)
  })

  it('keeps hysteresis between 80 and 112 so mid-band does not flicker', () => {
    expect(iconModeForWidth(96, false)).toBe(false)
    expect(iconModeForWidth(96, true)).toBe(true)
  })

  it('clamps live drag to icon column through max labeled width', () => {
    expect(clampLiveWidth(10)).toBe(ICON_WIDTH)
    expect(clampLiveWidth(900)).toBe(MAX_WIDTH)
    expect(clampLiveWidth(200)).toBe(200)
  })

  it('persists labeled width at or above the labeled minimum', () => {
    expect(labeledWidthFromLive(80)).toBe(MIN_WIDTH)
    expect(labeledWidthFromLive(256)).toBe(256)
  })
})
