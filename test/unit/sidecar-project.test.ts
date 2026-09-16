import { describe, expect, it } from 'vitest'
import { projectName, RESERVED_SLUGS } from '../../src/server/utils/sidecars'

describe('sidecar project naming', () => {
  it('prefixes compose projects with bros-sc-', () => {
    expect(projectName('ollama')).toBe('bros-sc-ollama')
    expect(projectName('openwebui')).toBe('bros-sc-openwebui')
  })

  it('reserves core app routes from sidecar slugs', () => {
    expect(RESERVED_SLUGS.has('models')).toBe(true)
    expect(RESERVED_SLUGS.has('api')).toBe(true)
    expect(RESERVED_SLUGS.has('ollama')).toBe(false)
  })
})
