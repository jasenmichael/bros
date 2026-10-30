import { describe, expect, it } from 'vitest'
import { dockerAppKindLabel } from '../../src/ui/utils/docker-app/dockerAppSourceLabel'

describe('dockerAppKindLabel', () => {
  it('maps shipped core and addon, custom, and git', () => {
    expect(dockerAppKindLabel('shipped', 'core')).toBe('core')
    expect(dockerAppKindLabel('shipped', 'addon')).toBe('addon')
    expect(dockerAppKindLabel('custom', 'custom')).toBe('custom')
    expect(dockerAppKindLabel('https://github.com/org/dockerApps.git', 'custom')).toBe('repo')
    expect(dockerAppKindLabel('git repo', 'custom')).toBe('repo')
    expect(dockerAppKindLabel('custom', 'custom', 'https://github.com/org/dockerApps.git')).toBe('custom')
  })
})
