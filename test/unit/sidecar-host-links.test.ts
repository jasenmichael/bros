import { describe, expect, it } from 'vitest'
import {
  sidecarApiCopyUrls,
  sidecarCliCommands,
  sidecarEndpointCopyUrls,
  sidecarOpenLinks,
  sidecarTypePills,
  sidecarWebUiLinks,
} from '../../src/app/utils/sidecars/sidecarHostLinks'

describe('sidecar host links', () => {
  it('opens published webui only and pins the same links', () => {
    const ollama = {
      name: 'Ollama',
      interfaces: [
        { type: 'api', service: 'ollama', containerPort: 11434, publish: 11435, basePath: '/api' },
        { type: 'openai', service: 'ollama', containerPort: 11434, publish: 11435, basePath: '/v1' },
      ],
    }
    expect(sidecarOpenLinks(ollama)).toEqual([])
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

  it('opens openjev FastAPI docs via webui basePath', () => {
    const openjev = {
      name: 'OpenJEV',
      id: 'openjev',
      interfaces: [
        { type: 'webui', service: 'openjev', containerPort: 8080, publish: 8092, basePath: '/docs' },
        { type: 'api', service: 'openjev', containerPort: 8080, publish: 8092, basePath: '/v1' },
      ],
    }
    expect(sidecarOpenLinks(openjev)).toEqual([
      { label: 'OpenJEV', to: 'http://127.0.0.1:8092/docs', external: true, hostPort: 8092 },
    ])
    expect(sidecarWebUiLinks(openjev)).toEqual(sidecarOpenLinks(openjev))
  })

  it('copies path URLs only, including the OpenAI Docker-network URL', () => {
    const ollama = {
      name: 'Ollama',
      interfaces: [
        { type: 'api', service: 'ollama', containerPort: 11434, publish: 11435, basePath: '/api' },
        { type: 'openai', service: 'ollama', containerPort: 11434, publish: 11435, basePath: '/v1' },
      ],
    }
    expect(sidecarApiCopyUrls(ollama)).toEqual([
      { url: 'http://127.0.0.1:11435/api', network: 'host' },
      { url: 'http://ollama:11434/api', network: 'bros' },
    ])
    expect(sidecarEndpointCopyUrls(ollama, 'openai')).toEqual([
      { url: 'http://127.0.0.1:11435/v1', network: 'host' },
      { url: 'http://ollama:11434/v1', network: 'bros' },
    ])
    expect(sidecarTypePills(ollama)).toEqual(['api', 'openapi'])
  })

  it('defaults a missing openai basePath to /v1 and lists cli names once per interface', () => {
    const pack = {
      name: 'OpenCode',
      interfaces: [
        { type: 'cli', command: 'opencode' },
        { type: 'cli', bin: 'agent', command: 'cursor' },
        { type: 'openai', service: 'ollama', containerPort: 11434, publish: 11435 },
        { type: 'webui', service: 'opencode', containerPort: 4096, publish: 4097 },
      ],
    }
    expect(sidecarEndpointCopyUrls(pack, 'openai')).toEqual([
      { url: 'http://127.0.0.1:11435/v1', network: 'host' },
      { url: 'http://ollama:11434/v1', network: 'bros' },
    ])
    expect(sidecarCliCommands(pack)).toEqual(['opencode', 'agent'])
    expect(sidecarTypePills(pack)).toEqual(['cli', 'openapi', 'ui'])
  })
})
