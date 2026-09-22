import { describe, expect, it } from 'vitest'
import { sidecarApiCopyUrls, sidecarOpenLinks } from '../../src/app/utils/sidecarHostLinks'

describe('sidecarHostLinks', () => {
  it('opens published webui and api, not unpublished api', () => {
    expect(sidecarOpenLinks({
      name: 'OpenCode',
      interfaces: [{ type: 'webui', publish: 4097 }],
    })).toEqual([{
      label: 'OpenCode',
      to: 'http://127.0.0.1:4097/',
      external: true,
      hostPort: 4097,
    }])
    expect(sidecarOpenLinks({
      name: 'Firecrawl',
      interfaces: [{ type: 'api', publish: 3002, basePath: '/v2' }],
    })).toEqual([{
      label: 'Firecrawl',
      to: 'http://127.0.0.1:3002/',
      external: true,
      hostPort: 3002,
    }])
    expect(sidecarOpenLinks({
      name: 'Internal',
      interfaces: [{ type: 'api', containerPort: 3002 }],
    })).toEqual([])
  })

  it('copies firecrawl host root and /v2 once per port', () => {
    expect(sidecarApiCopyUrls({
      name: 'Firecrawl',
      interfaces: [{ type: 'api', service: 'firecrawl', publish: 3002, containerPort: 3002, basePath: '/v2' }],
    })).toEqual([
      { url: 'http://127.0.0.1:3002/', network: 'host' },
      { url: 'http://127.0.0.1:3002/v2', network: 'host' },
      { url: 'http://firecrawl:3002/', network: 'bros' },
      { url: 'http://firecrawl:3002/v2', network: 'bros' },
    ])
  })
})
