import { describe, expect, it } from 'vitest'
import {
  addDockerAppBusy,
  isDockerAppBusy,
  isDockerAppRowBusy,
  removeDockerAppBusy,
  dockerAppBusyKey,
} from '../../src/ui/utils/docker-app/dockerAppBusy'

describe('dockerAppBusy', () => {
  it('tracks concurrent actions on different dockerApps', () => {
    let busy = new Set<string>()
    busy = addDockerAppBusy(busy, dockerAppBusyKey('paperclip', 'start'))
    busy = addDockerAppBusy(busy, dockerAppBusyKey('octop', 'stop'))

    expect(isDockerAppBusy(busy, 'paperclip', 'start')).toBe(true)
    expect(isDockerAppBusy(busy, 'octop', 'stop')).toBe(true)
    expect(isDockerAppRowBusy(busy, 'paperclip')).toBe(true)
    expect(isDockerAppRowBusy(busy, 'octop')).toBe(true)
    expect(isDockerAppBusy(busy, 'paperclip', 'stop')).toBe(false)
  })

  it('clears only the finished key', () => {
    let busy = addDockerAppBusy(new Set(), dockerAppBusyKey('paperclip', 'start'))
    busy = addDockerAppBusy(busy, dockerAppBusyKey('octop', 'restart'))
    busy = removeDockerAppBusy(busy, dockerAppBusyKey('octop', 'restart'))

    expect(isDockerAppBusy(busy, 'paperclip', 'start')).toBe(true)
    expect(isDockerAppBusy(busy, 'octop', 'restart')).toBe(false)
    expect(isDockerAppRowBusy(busy, 'octop')).toBe(false)
  })

  it('rowBusy blocks sibling actions on the same dockerApp', () => {
    const busy = addDockerAppBusy(new Set(), dockerAppBusyKey('paperclip', 'start'))
    expect(isDockerAppRowBusy(busy, 'paperclip')).toBe(true)
    expect(isDockerAppBusy(busy, 'paperclip', 'start')).toBe(true)
    expect(isDockerAppBusy(busy, 'paperclip', 'stop')).toBe(false)
  })
})
