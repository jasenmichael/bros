import { describe, expect, it } from 'vitest'
import { guiAppProxyId } from '../../src/ui/utils/gui'
import { injectDesktopStreamVisibility, isDesktopStreamPath } from '../../src/server/utils/sidecars/guiProxy'
import { needsAuthGate } from '../../src/server/utils/sidecars/sidecarProxy'
import { isReservedSidecarId, parseSidecarMeta, shouldAutostartSidecar } from '../../src/server/utils/sidecars/sidecars'

describe('desktop stream paths', () => {
  it('keeps bare /desktop as the page and proxies the stream prefix', () => {
    expect(isDesktopStreamPath('/desktop')).toBe(false)
    expect(isDesktopStreamPath('/desktop/')).toBe(false)
    expect(isDesktopStreamPath('/desktop/view')).toBe(true)
    expect(isDesktopStreamPath('/desktop/view/')).toBe(true)
    expect(isDesktopStreamPath('/desktop/view/index.html')).toBe(true)
    expect(isDesktopStreamPath('/desktop-extra')).toBe(false)
  })

  it('ties the embedded stream visibility to the Bros page', () => {
    const html = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'
    const next = injectDesktopStreamVisibility(html)
    expect(next).toContain('data-bros-stream-visibility')
    expect(next.indexOf('data-bros-stream-visibility')).toBeLessThan(next.indexOf('<meta'))
    expect(injectDesktopStreamVisibility(next)).toBe(next)
    expect(injectDesktopStreamVisibility('<html><body>x</body></html>')).toMatch(/^<script data-bros-stream-visibility>/)
  })

  it('names one process id per package GUI', () => {
    expect(guiAppProxyId('gimp', 'Gimp.Bin')).toBe('app-gimp-gimp-bin')
    expect(guiAppProxyId('gimp')).toBe('app-gimp')
  })

  it('gates /desktop and /terminal on the session and rejects a published gui interface', () => {
    expect(needsAuthGate('/desktop', [])).toBe(true)
    expect(needsAuthGate('/desktop/view/', [])).toBe(true)
    expect(needsAuthGate('/terminal', [])).toBe(true)
    expect(needsAuthGate('/terminal/session/', [])).toBe(true)
    expect(() => parseSidecarMeta({
      id: 'gimp',
      name: 'Gimp',
      interfaces: [{ type: 'gui', service: 'gimp', containerPort: 14500, publish: 14500 }],
    })).toThrow(/publish/)
    expect(parseSidecarMeta({
      id: 'gimp',
      name: 'Gimp',
      interfaces: [{ type: 'gui', service: 'gimp', command: 'gimp' }],
    }).interfaces[0].command).toBe('gimp')
    expect(() => parseSidecarMeta({
      id: 'gimp',
      name: 'Gimp',
      interfaces: [{ type: 'gui', service: 'gimp' }],
    })).toThrow(/command/)
    expect(isReservedSidecarId('gui')).toBe(true)
    expect(isReservedSidecarId('terminal')).toBe(true)
    expect(shouldAutostartSidecar({
      id: 'gimp',
      interfaces: [{ type: 'gui', command: 'gimp' }],
    }, { autostart: true })).toBe(true)
  })
})
