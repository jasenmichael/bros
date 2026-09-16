import { describe, expect, it, vi, afterEach } from 'vitest'
import { isRetryablePullError, pullOllamaModelStream, pullOllamaModelStreamWithRetry } from '../../src/server/utils/providers'

function ndjsonBody(lines: object[]) {
  const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

describe('pullOllamaModelStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('yields NDJSON progress events from Ollama pull', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ndjsonBody([
      { status: 'pulling manifest' },
      { status: 'downloading', completed: 50, total: 200 },
      { status: 'success' },
    ]), { status: 200 })))

    const events = []
    for await (const evt of pullOllamaModelStream('http://ollama:11434', 'llama3.2:3b')) {
      events.push(evt)
    }

    expect(events).toEqual([
      { status: 'pulling manifest' },
      { status: 'downloading', completed: 50, total: 200 },
      { status: 'success' },
    ])
  })
})

describe('isRetryablePullError', () => {
  it('matches TLS handshake timeout and 5xx', () => {
    expect(isRetryablePullError('pull model manifest: Get "https://registry.ollama.ai/v2/freehuntx/qwen3-coder/manifests/14b": net/http: TLS handshake timeout')).toBe(true)
    expect(isRetryablePullError('503 Service Unavailable')).toBe(true)
    expect(isRetryablePullError('file does not exist')).toBe(false)
  })
})

describe('pullOllamaModelStreamWithRetry', () => {
  it('retries once on TLS timeout then surfaces the second error', async () => {
    const tls = { error: 'pull model manifest: Get "https://registry.ollama.ai/v2/freehuntx/qwen3-coder/manifests/14b": net/http: TLS handshake timeout' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(ndjsonBody([tls]), { status: 200 }))
      .mockResolvedValueOnce(new Response(ndjsonBody([tls]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const events = []
    for await (const evt of pullOllamaModelStreamWithRetry('http://ollama:11434', 'freehuntx/qwen3-coder:14b')) {
      events.push(evt)
    }

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(events[0]?.status).toMatch(/^Retrying after:/)
    expect(events[1]?.error).toContain('TLS handshake timeout')
  })

  it('does not retry a permanent registry miss', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(ndjsonBody([
      { error: 'pull model manifest: file does not exist' },
    ]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const events = []
    for await (const evt of pullOllamaModelStreamWithRetry('http://ollama:11434', 'nope/missing:tag')) {
      events.push(evt)
    }

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(events).toEqual([{ error: 'pull model manifest: file does not exist' }])
  })
})
