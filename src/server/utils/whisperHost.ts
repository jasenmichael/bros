import { sidecarReachUrl } from './hostProbe'

export const WHISPER_SIDECAR_DNS = 'http://whisper:8000'
export const WHISPER_SIDECAR_PUBLISH = 8090
export const WHISPER_MODEL = 'Systran/faster-whisper-base'
export const WHISPER_MAX_BYTES = 15 * 1024 * 1024
export const WHISPER_HEALTH_TIMEOUT_MS = 90_000
export const WHISPER_TRANSCRIBE_TIMEOUT_MS = 120_000

const AUDIO_NAME_RE = /\.(webm|ogg|oga|wav|mp4|m4a|mpeg|mp3|mpga)$/i
const AUDIO_TYPE_RE = /^(audio\/|video\/webm|video\/mp4)/i

export type MultipartPart = {
  name?: string
  filename?: string
  type?: string
  data?: Buffer | Uint8Array
}

/** Reachable Whisper sidecar: Docker DNS in-container, publish port on host Node. */
export function sidecarWhisperUrl(): string {
  return sidecarReachUrl({
    service: 'whisper',
    containerPort: 8000,
    publish: WHISPER_SIDECAR_PUBLISH,
    envPortKey: 'BROS_WHISPER_PORT',
  })
}

export function parseWhisperText(body: unknown): string {
  if (typeof body === 'string') return body
  if (!body || typeof body !== 'object') return ''
  const row = body as Record<string, unknown>
  if (typeof row.text === 'string') return row.text
  if (typeof row.transcription === 'string') return row.transcription
  return ''
}

export function pickTranscribeFile(parts: MultipartPart[] | undefined | null): MultipartPart | null {
  if (!parts?.length) return null
  const named = parts.find((p) => p.name === 'file' && p.data && p.data.byteLength > 0)
  if (named) return named
  return parts.find((p) => p.data && p.data.byteLength > 0 && (p.filename || p.type)) || null
}

export function transcribeFileError(part: MultipartPart | null, contentLength?: number): { statusCode: number; statusMessage: string } | null {
  if (typeof contentLength === 'number' && contentLength > WHISPER_MAX_BYTES) {
    return { statusCode: 413, statusMessage: 'Audio too large' }
  }
  if (!part?.data || part.data.byteLength === 0) {
    return { statusCode: 400, statusMessage: 'file required' }
  }
  if (part.data.byteLength > WHISPER_MAX_BYTES) {
    return { statusCode: 413, statusMessage: 'Audio too large' }
  }
  const type = (part.type || '').split(';')[0]?.trim() || ''
  const name = part.filename || ''
  const typeOk = !type || AUDIO_TYPE_RE.test(type)
  const nameOk = !name || AUDIO_NAME_RE.test(name)
  if (name && !nameOk && type && !typeOk) {
    return { statusCode: 400, statusMessage: 'Unsupported audio type' }
  }
  if (!name && type && !typeOk) {
    return { statusCode: 400, statusMessage: 'Unsupported audio type' }
  }
  return null
}

const WHISPER_CONNECT_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
])

/** ofetch nests `cause.cause.code` (TypeError → Error). Walk a few levels. */
export function isWhisperUnreachable(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== 'object' || depth > 6) return false
  const row = err as {
    status?: number
    statusCode?: number
    cause?: unknown
    code?: string
    message?: string
  }
  if (typeof row.code === 'string' && WHISPER_CONNECT_CODES.has(row.code)) return true
  if (typeof row.message === 'string' && /ECONNREFUSED|ENOTFOUND|fetch failed/i.test(row.message)) return true
  const status = row.status || row.statusCode
  if (status === 502 || status === 503 || status === 504) return true
  return isWhisperUnreachable(row.cause, depth + 1)
}

export async function waitForWhisperHealth(
  baseUrl: string,
  opts?: {
    timeoutMs?: number
    intervalMs?: number
    get?: (url: string) => Promise<unknown>
  },
): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? WHISPER_HEALTH_TIMEOUT_MS
  const intervalMs = opts?.intervalMs ?? 500
  const get = opts?.get
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if (get) await get(`${baseUrl}/health`)
      else {
        const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) })
        if (!res.ok) throw new Error(String(res.status))
      }
      return true
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  return false
}
