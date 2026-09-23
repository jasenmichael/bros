import { afterEach, describe, expect, it } from 'vitest'
import { setAppRunsInDockerForTests } from '../../src/server/utils/hostProbe'
import {
  isWhisperUnreachable,
  parseWhisperText,
  pickTranscribeFile,
  sidecarWhisperUrl,
  transcribeFileError,
  waitForWhisperHealth,
  WHISPER_MAX_BYTES,
} from '../../src/server/utils/whisperHost'

describe('whisper host', () => {
  afterEach(() => {
    setAppRunsInDockerForTests(undefined)
    delete process.env.BROS_WHISPER_PORT
  })

  it('uses Docker DNS in-container and publish port on host Node', () => {
    setAppRunsInDockerForTests(true)
    expect(sidecarWhisperUrl()).toBe('http://whisper:8000')
    setAppRunsInDockerForTests(false)
    expect(sidecarWhisperUrl()).toBe('http://127.0.0.1:8090')
    process.env.BROS_WHISPER_PORT = '18090'
    expect(sidecarWhisperUrl()).toBe('http://127.0.0.1:18090')
  })

  it('parses text, transcription, and raw string', () => {
    expect(parseWhisperText({ text: ' hello ' })).toBe(' hello ')
    expect(parseWhisperText({ transcription: 'hi' })).toBe('hi')
    expect(parseWhisperText('raw')).toBe('raw')
    expect(parseWhisperText({})).toBe('')
    expect(parseWhisperText(null)).toBe('')
  })

  it('maps missing file to 400 and oversized to 413', () => {
    expect(transcribeFileError(null)?.statusCode).toBe(400)
    expect(transcribeFileError({ name: 'file', data: Buffer.alloc(0) })?.statusCode).toBe(400)
    expect(transcribeFileError({ name: 'file', data: Buffer.alloc(4), type: 'text/plain', filename: 'note.txt' })?.statusCode).toBe(400)
    expect(transcribeFileError({ name: 'file', data: Buffer.alloc(WHISPER_MAX_BYTES + 1), type: 'audio/webm' })?.statusCode).toBe(413)
    expect(transcribeFileError({ name: 'file', data: Buffer.from('x'), type: 'audio/webm' }, WHISPER_MAX_BYTES + 2)?.statusCode).toBe(413)
    expect(transcribeFileError({ name: 'file', data: Buffer.from('x'), type: 'audio/webm', filename: 'a.webm' })).toBeNull()
  })

  it('picks the file part', () => {
    const file = { name: 'file', filename: 'a.webm', type: 'audio/webm', data: Buffer.from('abc') }
    expect(pickTranscribeFile([{ name: 'other', data: Buffer.from('no') }, file])).toEqual(file)
    expect(pickTranscribeFile([])).toBeNull()
  })

  it('treats connect failures and 503 as unreachable', () => {
    expect(isWhisperUnreachable({ cause: { code: 'ECONNREFUSED' } })).toBe(true)
    expect(isWhisperUnreachable({
      message: '[POST] "http://whisper:8000/v1/audio/transcriptions": <no response> fetch failed',
      cause: { message: 'fetch failed', cause: { code: 'ECONNREFUSED' } },
    })).toBe(true)
    expect(isWhisperUnreachable({ statusCode: 503 })).toBe(true)
    expect(isWhisperUnreachable({ status: 400 })).toBe(false)
  })

  it('waitForWhisperHealth returns false after timeout', async () => {
    const ok = await waitForWhisperHealth('http://127.0.0.1:9', {
      timeoutMs: 40,
      intervalMs: 10,
      get: async () => {
        throw new Error('down')
      },
    })
    expect(ok).toBe(false)
  })

  it('waitForWhisperHealth returns true on first success', async () => {
    const ok = await waitForWhisperHealth('http://whisper:8000', {
      timeoutMs: 1000,
      get: async () => ({}),
    })
    expect(ok).toBe(true)
  })
})
