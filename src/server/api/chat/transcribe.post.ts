import { ofetch } from 'ofetch'
import { startDockerApp } from '../../utils/docker'
import { WHISPER_DOCKER_APP_ID } from '../../utils/docker-app/dockerApps'
import { isWhisperEnabled } from '../../utils/settings'
import {
  WHISPER_MODEL,
  WHISPER_TRANSCRIBE_TIMEOUT_MS,
  isWhisperUnreachable,
  parseWhisperText,
  pickTranscribeFile,
  dockerAppWhisperUrl,
  transcribeFileError,
  waitForWhisperHealth,
} from '../../utils/whisperHost'

async function proxyTranscribe(file: { data: Buffer | Uint8Array; filename?: string; type?: string }) {
  const form = new FormData()
  const bytes = new Uint8Array(file.data)
  const blob = new Blob([bytes], { type: file.type || 'audio/webm' })
  form.append('file', blob, file.filename || 'audio.webm')
  form.append('model', WHISPER_MODEL)
  const body = await ofetch(`${dockerAppWhisperUrl()}/v1/audio/transcriptions`, {
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
  const audio = file?.data
  if (bad || !audio) {
    throw createError(bad || { statusCode: 400, statusMessage: 'file required' })
  }
  if (!isWhisperEnabled()) {
    throw createError({ statusCode: 503, statusMessage: 'Enable Whisper in Settings' })
  }

  try {
    return await proxyTranscribe({ data: audio, filename: file?.filename, type: file?.type })
  } catch (err) {
    if (!isWhisperUnreachable(err)) throw err
  }

  try {
    await startDockerApp(WHISPER_DOCKER_APP_ID)
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status && status !== 409) throw err
  }

  const ready = await waitForWhisperHealth(dockerAppWhisperUrl())
  if (!ready) {
    throw createError({ statusCode: 503, statusMessage: 'Whisper docker app unreachable' })
  }

  try {
    return await proxyTranscribe({ data: audio, filename: file?.filename, type: file?.type })
  } catch (err) {
    if (isWhisperUnreachable(err)) {
      throw createError({ statusCode: 503, statusMessage: 'Whisper docker app unreachable' })
    }
    throw err
  }
})
