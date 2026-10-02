import { describe, expect, it } from 'vitest'
import { sidecarKindLabel } from '../../src/app/utils/sidecars/sidecarSourceLabel'

describe('sidecarKindLabel', () => {
  it('maps shipped core and addon, custom, and git', () => {
    expect(sidecarKindLabel('shipped', 'core')).toBe('core')
    expect(sidecarKindLabel('shipped', 'addon')).toBe('addon')
    expect(sidecarKindLabel('custom', 'additional')).toBe('custom')
    expect(sidecarKindLabel('https://github.com/org/sidecars.git', 'additional')).toBe('repo')
    expect(sidecarKindLabel('git repo', 'additional')).toBe('repo')
    expect(sidecarKindLabel('custom', 'additional', 'https://github.com/org/sidecars.git')).toBe('custom')
  })
})
