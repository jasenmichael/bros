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

  it('requires webui publish and rejects 3000/8080', () => {
    expect(() => parseSidecarMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', containerPort: 80 }],
    })).toThrow(/publish/)
    expect(() => parseSidecarMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', containerPort: 80, publish: 3000 }],
    })).toThrow(/3000 or 8080/)
    expect(parseSidecarMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', containerPort: 80, publish: 3090 }],
    }).interfaces[0].publish).toBe(3090)
  })

  it('parses ollama hostProbe and publish 11435', () => {
    const meta = parseSidecarMeta({
      id: 'ollama',
      name: 'Ollama',
      hostProbe: { ports: [11434, 11436, 22000], path: '/api/version' },
      interfaces: [{ type: 'api', service: 'ollama', containerPort: 11434, publish: 11435 }],
    })
    expect(meta.hostProbe?.ports).toEqual([11434, 11436, 22000])
    expect(meta.interfaces[0].publish).toBe(11435)
    expect(meta.interfaces[0].containerPort).toBe(11434)
  })
})
