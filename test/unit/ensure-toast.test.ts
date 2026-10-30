import { describe, expect, it } from 'vitest'
import { splitEnsureCards, takeEnsureCard } from '../../src/ui/utils/ensureToast'

describe('ensure toasts', () => {
  it('shows each package version only on that package card', () => {
    const { ready, live } = splitEnsureCards([
      'ok:devbox:0.18.4 / nix (Nix) 2.35.4',
      'ok:node:v26.7.0',
      'install:cargo',
      'install:uv', 'ok:uv:uv 0.5.0',
      'install:bun', 'fail:bun',
    ])
    expect(ready.map((card) => [card.show, card.then, card.version])).toEqual([
      ['Devbox and Nix found', 'Devbox and Nix found', '0.18.4 / nix (Nix) 2.35.4'],
      ['Node found', 'Node found', 'v26.7.0'],
      ['Installing Uv', 'Uv found', 'uv 0.5.0'],
      ['Installing Bun', 'Bun failed to install', ''],
    ])
    expect(live).toEqual({
      id: 'cargo',
      show: 'Installing Cargo',
      then: '',
      error: false,
      version: '',
    })
    expect(JSON.stringify(ready.find((card) => card.id === 'uv'))).not.toContain('26.7.0')
    expect(JSON.stringify(live)).not.toContain('26.7.0')
    const waiting = [...ready]
    expect(takeEnsureCard(waiting, false)?.show).toBe('Devbox and Nix found')
    expect(takeEnsureCard(waiting, true)).toBeNull()
    expect(takeEnsureCard(waiting, false)?.version).toBe('v26.7.0')
  })
})