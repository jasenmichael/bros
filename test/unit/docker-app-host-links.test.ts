import { describe, expect, it } from 'vitest'
import {
  packageWebuiOpenHref,
  dockerAppApiCopyUrls,
  dockerAppCardBlocks,
  dockerAppCliCommands,
  dockerAppEndpointCopyUrls,
  dockerAppGuiCommands,
  dockerAppOpenLinks,
  dockerAppTypePills,
  dockerAppWebUiLinks,
} from '../../app/ui/utils/docker-app/dockerAppHostLinks'

describe('dockerApp host links', () => {
  it('opens published webui only and pins the same links', () => {
    const ollama = {
      name: 'Ollama',
      interfaces: [
        { type: 'api', service: 'ollama', containerPort: 11434, publish: 11435, basePath: '/api' },
        { type: 'openai', service: 'ollama', containerPort: 11434, publish: 11435, basePath: '/v1' },
      ],
    }
    expect(dockerAppOpenLinks(ollama)).toEqual([])
    expect(dockerAppWebUiLinks(ollama)).toEqual([])

    const ui = {
      name: 'OpenCode',
      interfaces: [
        { type: 'webui', service: 'opencode', containerPort: 4096, publish: 4097 },
      ],
    }
    expect(dockerAppWebUiLinks(ui)).toEqual([
      { label: 'OpenCode', to: 'http://127.0.0.1:4097/', external: true, hostPort: 4097 },
    ])
    expect(dockerAppOpenLinks(ui)).toEqual(dockerAppWebUiLinks(ui))
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
    expect(dockerAppOpenLinks(openjev)).toEqual([
      { label: 'OpenJEV', to: 'http://127.0.0.1:8092/docs', external: true, hostPort: 8092 },
    ])
    expect(dockerAppWebUiLinks(openjev)).toEqual(dockerAppOpenLinks(openjev))
  })

  it('copies path URLs only, including the OpenAI Docker-network URL', () => {
    const ollama = {
      name: 'Ollama',
      interfaces: [
        { type: 'api', service: 'ollama', containerPort: 11434, publish: 11435, basePath: '/api' },
        { type: 'openai', service: 'ollama', containerPort: 11434, publish: 11435, basePath: '/v1' },
      ],
    }
    expect(dockerAppApiCopyUrls(ollama)).toEqual([
      { url: 'http://127.0.0.1:11435/api', network: 'host' },
      { url: 'http://ollama:11434/api', network: 'bros' },
    ])
    expect(dockerAppEndpointCopyUrls(ollama, 'openai')).toEqual([
      { url: 'http://127.0.0.1:11435/v1', network: 'host' },
      { url: 'http://ollama:11434/v1', network: 'bros' },
    ])
    expect(dockerAppTypePills(ollama)).toEqual(['api', 'openapi'])
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
    expect(dockerAppEndpointCopyUrls(pack, 'openai')).toEqual([
      { url: 'http://127.0.0.1:11435/v1', network: 'host' },
      { url: 'http://ollama:11434/v1', network: 'bros' },
    ])
    expect(dockerAppCliCommands(pack)).toEqual(['opencode', 'agent'])
    expect(dockerAppTypePills(pack)).toEqual(['cli', 'openapi', 'webui'])
  })

  it('lists cursor cli bins separately from the one gui command', () => {
    const cursor = {
      name: 'Cursor',
      interfaces: [
        { type: 'cli', bin: 'agent', command: '/home/bros/.local/bin/agent' },
        { type: 'cli', bin: 'cursor-agent', command: '/home/bros/.local/bin/agent' },
        { type: 'cli', bin: 'cursor', command: '/usr/bin/cursor' },
        { type: 'cli', bin: 'cursor-tunnel', command: '/usr/share/cursor/bin/cursor-tunnel' },
        { type: 'gui', service: 'cursor', command: 'cursor' },
      ],
    }
    expect(dockerAppCliCommands(cursor)).toEqual(['agent', 'cursor-agent', 'cursor', 'cursor-tunnel'])
    expect(dockerAppGuiCommands(cursor)).toEqual(['cursor'])
    expect(dockerAppCardBlocks(cursor)).toEqual([
      { label: 'cli', rows: [{ command: 'agent' }, { command: 'cursor-agent' }, { command: 'cursor' }, { command: 'cursor-tunnel' }] },
      { label: 'gui', rows: [{ command: 'cursor' }] },
    ])
  })

  it('opens package webui on host publish only while enabled, forwardHost, and running', () => {
    const paperclip = {
      enabled: true,
      forwardHost: true,
      services: [{ command: 'paperclipai run' }],
      serviceRunning: true,
      interfaces: [{ type: 'webui', publish: 3100 }],
    }
    expect(packageWebuiOpenHref(paperclip)).toBe('http://127.0.0.1:3100/')
    expect(packageWebuiOpenHref({ ...paperclip, serviceRunning: false })).toBe('')
    expect(packageWebuiOpenHref({ ...paperclip, enabled: false })).toBe('')
    expect(packageWebuiOpenHref({ ...paperclip, forwardHost: false })).toBe('')
    expect(packageWebuiOpenHref({
      enabled: true,
      interfaces: [{ type: 'webui', publish: 4097 }],
    })).toBe('http://127.0.0.1:4097/')
  })
})
