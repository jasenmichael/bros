import { describe, expect, it } from 'vitest'
import {
  sidecarOpenLinks,
  sidecarWebUiLinks,
} from '../../src/app/utils/sidecarHostLinks'

describe('sidecar host links', () => {
  it('opens published api and webui, pins webui only', () => {
    const ollama = {
      name: 'Ollama',
      interfaces: [
        { type: 'api', service: 'ollama', containerPort: 11434, publish: 11435, basePath: '/api' },
        { type: 'openai', service: 'ollama', containerPort: 11434, publish: 11435, basePath: '/v1' },
      ],
    }
    expect(sidecarOpenLinks(ollama).map((l) => l.hostPort)).toEqual([11435])
    expect(sidecarWebUiLinks(ollama)).toEqual([])

    const ui = {
      name: 'OpenCode',
      interfaces: [
        { type: 'webui', service: 'opencode', containerPort: 4096, publish: 4097 },
      ],
    }
    expect(sidecarWebUiLinks(ui)).toEqual([
      { label: 'OpenCode', to: 'http://127.0.0.1:4097/', external: true, hostPort: 4097 },
    ])
    expect(sidecarOpenLinks(ui)).toEqual(sidecarWebUiLinks(ui))
  })
})
