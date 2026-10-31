import { describe, expect, it } from 'vitest'
import {
  ICON_WIDTH,
  MAX_WIDTH,
  MIN_SECTION_FLEX,
  MIN_WIDTH,
  SNAP_TO_ICON,
  SNAP_TO_LABELS,
  applySectionDrag,
  clampLiveWidth,
  iconModeForWidth,
  labeledWidthFromLive,
} from '../../app/layers/theme/app/composables/useNavDock'

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

  it('drags neighboring section flex weights and respects the floor', () => {
    const [a, b] = applySectionDrag(1, 1, 50, 200)
    expect(a + b).toBeCloseTo(2)
    expect(a).toBeGreaterThan(1)
    expect(b).toBeLessThan(1)
    const [lo, hi] = applySectionDrag(MIN_SECTION_FLEX, 2, -500, 100)
    expect(lo).toBe(MIN_SECTION_FLEX)
    expect(hi).toBeCloseTo(2)
  })

  it('allows primary flex to return to 0 (content-sized under Agents)', () => {
    const [a, b] = applySectionDrag(0.5, 1.5, -500, 100, 0, MIN_SECTION_FLEX)
    expect(a).toBe(0)
    expect(b).toBeCloseTo(2)
  })

  it('grows primary from a content-sized (0,0) default', () => {
    const [a, b] = applySectionDrag(0, 0, 50, 200, 0, 0)
    expect(a).toBeCloseTo(0.25)
    expect(b).toBe(0)
  })
})
