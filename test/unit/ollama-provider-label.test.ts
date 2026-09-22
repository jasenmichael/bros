import { describe, expect, it } from 'vitest'
import { ollamaProviderDisplayName } from '../../src/app/utils/ollamaProviderLabel'

describe('ollamaProviderDisplayName', () => {
  it('labels sidecar as Ollama (core)', () => {
    expect(ollamaProviderDisplayName({ id: 'ollama', name: 'Ollama sidecar' })).toBe('Ollama (core)')
  })

  it('labels host with live port and omits port when unknown', () => {
    expect(ollamaProviderDisplayName({ id: 'ollama-host', name: 'Ollama host', port: 11434 }))
      .toBe('Ollama (host port:11434)')
    expect(ollamaProviderDisplayName({ id: 'ollama-host' }, { hostOllamaPort: 22000 }))
      .toBe('Ollama (host port:22000)')
    expect(ollamaProviderDisplayName({ id: 'ollama-host', name: 'Ollama host' })).toBe('Ollama (host)')
  })

  it('leaves other providers unchanged', () => {
    expect(ollamaProviderDisplayName({ id: 'openai', name: 'OpenAI' })).toBe('OpenAI')
  })
})
