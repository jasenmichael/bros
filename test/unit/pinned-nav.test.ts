import { describe, expect, it } from 'vitest'
import { packageNavItems, pinnedNavItems } from '../../app/ui/composables/usePinnedNav'

function pinned(opts: {
  id: string
  name: string
  disabled?: boolean
  running: boolean
  publish: number
  navPinned?: boolean
}) {
  return {
    id: opts.id,
    name: opts.name,
    packageSlug: opts.id,
    disabled: opts.disabled,
    interfaces: [{
      type: 'webui',
      publish: opts.publish,
      ...(opts.id === 'opencode' ? { containerPort: 4096 } : {}),
    }],
    settings: { navPinned: opts.navPinned !== false },
    status: { running: opts.running },
  }
}

describe('pinned nav', () => {
  it('omits a nav link when a pinned dockerApp is disabled or stopped', () => {
    const items = pinnedNavItems([
      pinned({ id: 'opencode', name: 'OpenCode', disabled: true, running: true, publish: 4097 }),
      pinned({ id: 'other', name: 'Other', running: false, publish: 4101 }),
      pinned({ id: 'idle', name: 'Idle', running: true, publish: 4102, navPinned: false }),
      pinned({ id: 'live', name: 'Live', running: true, publish: 4103 }),
    ])
    expect(items).toEqual([
      { label: 'Live', to: 'http://127.0.0.1:4103/', icon: 'i-lucide-external-link', external: true },
    ])
  })

  it('pins a published package web UI while the service is running', () => {
    const pkg = {
      id: 'paperclip',
      name: 'Paperclip',
      navPinned: true,
      forwardHost: true,
      serviceRunning: true,
      services: ['paperclipai run'],
      interfaces: [{ type: 'webui', publish: 3100 }],
    }
    expect(packageNavItems([pkg])).toEqual([
      { label: 'Paperclip', to: 'http://127.0.0.1:3100/', icon: 'i-lucide-external-link', external: true },
    ])
    expect(packageNavItems([pkg], true)[0]?.to).toBe('/paperclip/')
    expect(packageNavItems([{ ...pkg, serviceRunning: false }])).toEqual([])
    expect(packageNavItems([{ ...pkg, enabled: false }])).toEqual([])
    expect(packageNavItems([{ ...pkg, forwardHost: false }])).toEqual([])
    expect(packageNavItems([{ ...pkg, navPinned: false }])).toEqual([])
  })
})
