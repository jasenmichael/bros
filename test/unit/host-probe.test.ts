import { afterEach, describe, expect, it } from 'vitest'
import {
  appRunsInDocker,
  composeAppSignals,
  dockerHostCandidates,
  firstPublishPort,
  hostUiUrl,
  setAppRunsInDockerForTests,
  sidecarReachUrl,
} from '../../src/server/utils/hostProbe'
import { sidecarOllamaUrl } from '../../src/server/utils/ollamaHost'
import { sidecarWhisperUrl } from '../../src/server/utils/whisperHost'

describe('dockerHostCandidates', () => {
  afterEach(() => {
    setAppRunsInDockerForTests(undefined)
  })

  it('uses 127.0.0.1 on host Node and skips host.docker.internal', () => {
    setAppRunsInDockerForTests(false)
    expect(dockerHostCandidates()).toEqual(['127.0.0.1', '172.17.0.1'])
  })

  it('uses host.docker.internal inside Docker', () => {
    setAppRunsInDockerForTests(true)
    expect(dockerHostCandidates()[0]).toBe('host.docker.internal')
    expect(dockerHostCandidates()).toContain('172.17.0.1')
  })
})

describe('firstPublishPort / hostUiUrl', () => {
  it('picks the first positive publish port', () => {
    expect(firstPublishPort([{ publish: 4097 }])).toBe(4097)
    expect(firstPublishPort([{}, { publish: 3080 }])).toBe(3080)
    expect(firstPublishPort([{ containerPort: 11434, publish: 11435 } as { publish?: number }])).toBe(11435)
    expect(firstPublishPort([])).toBeUndefined()
  })

  it('builds Open/Pin URLs on 127.0.0.1', () => {
    expect(hostUiUrl(3080)).toBe('http://127.0.0.1:3080/')
  })
})

describe('composeAppSignals', () => {
  it('treats Compose in-container paths as in-Docker', () => {
    expect(composeAppSignals({ BROS_DATA_DIR: '/data' })).toBe(true)
    expect(composeAppSignals({ BROS_WORKING_DIR: '/app' })).toBe(true)
    expect(composeAppSignals({ BROS_DATA_DIR: '/tmp/bros-data', BROS_WORKING_DIR: '/home/me/dev/bros' })).toBe(false)
    expect(composeAppSignals({})).toBe(false)
  })
})

describe('sidecarReachUrl', () => {
  afterEach(() => {
    setAppRunsInDockerForTests(undefined)
    delete process.env.BROS_OLLAMA_PORT
    delete process.env.BROS_WHISPER_PORT
  })

  const ollama = { service: 'ollama', containerPort: 11434, publish: 11435, envPortKey: 'BROS_OLLAMA_PORT' }
  const whisper = { service: 'whisper', containerPort: 8000, publish: 8090, envPortKey: 'BROS_WHISPER_PORT' }

  it('uses Docker DNS in-container and ignores host publish env', () => {
    setAppRunsInDockerForTests(true)
    expect(sidecarReachUrl(ollama, { BROS_OLLAMA_PORT: '19999' })).toBe('http://ollama:11434')
    expect(sidecarReachUrl(whisper, { BROS_WHISPER_PORT: '19998' })).toBe('http://whisper:8000')
    expect(sidecarOllamaUrl()).toBe('http://ollama:11434')
    expect(sidecarWhisperUrl()).toBe('http://whisper:8000')
  })

  it('uses 127.0.0.1 publish on host Node', () => {
    setAppRunsInDockerForTests(false)
    expect(sidecarReachUrl(ollama)).toBe('http://127.0.0.1:11435')
    expect(sidecarReachUrl(whisper)).toBe('http://127.0.0.1:8090')
    expect(sidecarOllamaUrl()).toBe('http://127.0.0.1:11435')
    expect(sidecarWhisperUrl()).toBe('http://127.0.0.1:8090')
  })

  it('honors env publish override on host Node', () => {
    setAppRunsInDockerForTests(false)
    expect(sidecarReachUrl(ollama, { BROS_OLLAMA_PORT: '11440' })).toBe('http://127.0.0.1:11440')
    expect(sidecarReachUrl(whisper, { BROS_WHISPER_PORT: '8091' })).toBe('http://127.0.0.1:8091')
    process.env.BROS_OLLAMA_PORT = '11440'
    process.env.BROS_WHISPER_PORT = '8091'
    expect(sidecarOllamaUrl()).toBe('http://127.0.0.1:11440')
    expect(sidecarWhisperUrl()).toBe('http://127.0.0.1:8091')
  })

  it('ignores invalid env publish override', () => {
    setAppRunsInDockerForTests(false)
    expect(sidecarReachUrl(ollama, { BROS_OLLAMA_PORT: 'nope' })).toBe('http://127.0.0.1:11435')
    expect(sidecarReachUrl(ollama, { BROS_OLLAMA_PORT: '0' })).toBe('http://127.0.0.1:11435')
  })

  it('test override wins over compose env signals', () => {
    setAppRunsInDockerForTests(false)
    expect(appRunsInDocker()).toBe(false)
    setAppRunsInDockerForTests(true)
    expect(appRunsInDocker()).toBe(true)
  })
})
