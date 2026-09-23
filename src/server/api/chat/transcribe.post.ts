import { ofetch } from 'ofetch'
import { startSidecar } from '../../utils/docker'
import { WHISPER_SIDECAR_ID } from '../../utils/sidecars'
import { isWhisperEnabled } from '../../utils/whisperSettings'
import {
  WHISPER_MODEL,
  WHISPER_TRANSCRIBE_TIMEOUT_MS,
  isWhisperUnreachable,
  parseWhisperText,
  pickTranscribeFile,
  sidecarWhisperUrl,
  transcribeFileError,
  waitForWhisperHealth,
} from '../../utils/whisperHost'

async function proxyTranscribe(file: { data: Buffer | Uint8Array; filename?: string; type?: string }) {
  const form = new FormData()
  const bytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data)
  const blob = new Blob([bytes], { type: file.type || 'audio/webm' })
  form.append('file', blob, file.filename || 'audio.webm')
  form.append('model', WHISPER_MODEL)
  const body = await ofetch(`${sidecarWhisperUrl()}/v1/audio/transcriptions`, {
    method: 'POST',
    body: form,
    timeout: WHISPER_TRANSCRIBE_TIMEOUT_MS,
    retry: 0,
  })
  return { text: parseWhisperText(body) }
}

export default defineEventHandler(async (event) => {
  const length = Number.parseInt(getHeader(event, 'content-length') || '', 10)
  const parts = await readMultipartFormData(event)
  const file = pickTranscribeFile(parts)
  const bad = transcribeFileError(file, Number.isFinite(length) ? length : undefined)
  if (bad || !file?.data) {
    throw createError(bad || { statusCode: 400, statusMessage: 'file required' })
  }
  if (!isWhisperEnabled()) {
    throw createError({ statusCode: 503, statusMessage: 'Enable Whisper in Settings' })
  }

  try {
    return await proxyTranscribe(file)
  } catch (err) {
    if (!isWhisperUnreachable(err)) throw err
  }

  try {
    await startSidecar(WHISPER_SIDECAR_ID)
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status && status !== 409) throw err
  }

  const ready = await waitForWhisperHealth(sidecarWhisperUrl())
  if (!ready) {
    throw createError({ statusCode: 503, statusMessage: 'Whisper sidecar unreachable' })
  }

  try {
    return await proxyTranscribe(file)
  } catch (err) {
    if (isWhisperUnreachable(err)) {
      throw createError({ statusCode: 503, statusMessage: 'Whisper sidecar unreachable' })
    }
    throw err
  }
})
