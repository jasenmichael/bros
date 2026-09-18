import { describe, expect, it } from 'vitest'
import { navTreeOpenState } from '../../src/layers/theme/app/utils/navTreeOpen'

describe('nav tree open state', () => {
  it('defaults open when the route is under the branch', () => {
    expect(navTreeOpenState(undefined, true)).toBe(true)
    expect(navTreeOpenState(undefined, false)).toBe(false)
  })

  it('lets a click close even when the route still matches', () => {
    expect(navTreeOpenState(false, true)).toBe(false)
    expect(navTreeOpenState(true, false)).toBe(true)
  })
})
