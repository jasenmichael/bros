import { describe, expect, it } from 'vitest'
import { sidecarSourceLabel } from '../../src/app/utils/sidecarSourceLabel'

describe('sidecarSourceLabel', () => {
  it('maps shipped to bros, custom to custom, git to repo', () => {
    expect(sidecarSourceLabel('shipped')).toBe('bros')
    expect(sidecarSourceLabel('custom')).toBe('custom')
    expect(sidecarSourceLabel('https://github.com/org/sidecars.git')).toBe('repo')
    expect(sidecarSourceLabel('git repo')).toBe('repo')
    expect(sidecarSourceLabel('custom', 'https://github.com/org/sidecars.git')).toBe('custom')
  })
})
