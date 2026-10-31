import { describe, expect, it } from 'vitest'
import { navTreeOpenState } from '../../app/layers/theme/app/utils/navTreeOpen'

describe('nav tree open state', () => {
  it('stays collapsed until the user opens it', () => {
    expect(navTreeOpenState(undefined, true)).toBe(false)
    expect(navTreeOpenState(undefined, false)).toBe(false)
  })

  it('honors an explicit toggle', () => {
    expect(navTreeOpenState(false, true)).toBe(false)
    expect(navTreeOpenState(true, false)).toBe(true)
  })
})
