import { describe, expect, it } from 'vitest'
import { sidecarSourceLabel } from '../../src/app/utils/sidecarSourceLabel'

describe('sidecarSourceLabel', () => {
  it('maps shipped to bros, data dir to custom, git to repo', () => {
    expect(sidecarSourceLabel('shipped')).toBe('bros')
    expect(sidecarSourceLabel('data dir')).toBe('custom')
    expect(sidecarSourceLabel('https://github.com/org/sidecars.git')).toBe('repo')
    expect(sidecarSourceLabel('git repo')).toBe('repo')
    expect(sidecarSourceLabel('data dir', 'https://github.com/org/sidecars.git')).toBe('repo')
  })
})
