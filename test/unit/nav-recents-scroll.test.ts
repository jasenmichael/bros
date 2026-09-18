import { describe, expect, it } from 'vitest'
import {
  navRecentsScrollHints,
  navRecentsScrollStep,
} from '../../src/layers/theme/app/utils/navRecentsScroll'

describe('nav recents scroll hints', () => {
  it('hides both arrows when the list fits', () => {
    expect(navRecentsScrollHints(0, 200, 200)).toEqual({
      canScrollUp: false,
      canScrollDown: false,
    })
  })

  it('shows down only at the top of a tall list', () => {
    expect(navRecentsScrollHints(0, 100, 400)).toEqual({
      canScrollUp: false,
      canScrollDown: true,
    })
  })

  it('shows up only at the bottom', () => {
    expect(navRecentsScrollHints(300, 100, 400)).toEqual({
      canScrollUp: true,
      canScrollDown: false,
    })
  })

  it('shows both when mid-list', () => {
    expect(navRecentsScrollHints(80, 100, 400)).toEqual({
      canScrollUp: true,
      canScrollDown: true,
    })
  })

  it('treats 1px remainder as the bottom', () => {
    expect(navRecentsScrollHints(99, 100, 200)).toEqual({
      canScrollUp: true,
      canScrollDown: false,
    })
  })

  it('steps at least 48px', () => {
    expect(navRecentsScrollStep(40)).toBe(48)
    expect(navRecentsScrollStep(200)).toBe(120)
  })
})
