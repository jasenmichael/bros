import { describe, expect, it } from 'vitest'
import { parseSidecarMeta, projectName, RESERVED_SLUGS } from '../../src/server/utils/sidecars'

describe('sidecar project naming', () => {
  it('prefixes compose projects with bros-sc-', () => {
    expect(projectName('ollama')).toBe('bros-sc-ollama')
    expect(projectName('openwebui')).toBe('bros-sc-openwebui')
  })

  it('reserves core app routes from sidecar slugs', () => {
    expect(RESERVED_SLUGS.has('models')).toBe(true)
    expect(RESERVED_SLUGS.has('api')).toBe(true)
    expect(RESERVED_SLUGS.has('status')).toBe(true)
    expect(RESERVED_SLUGS.has('ollama')).toBe(false)
  })

  it('requires webui hostPort and rejects 3000/8080', () => {
    expect(() => parseSidecarMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', targetPort: 80 }],
    })).toThrow(/hostPort/)
    expect(() => parseSidecarMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', targetPort: 80, hostPort: 3000 }],
    })).toThrow(/3000 or 8080/)
    expect(parseSidecarMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', targetPort: 80, hostPort: 3090 }],
    }).interfaces[0].hostPort).toBe(3090)
  })
})
