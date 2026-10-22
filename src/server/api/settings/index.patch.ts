import { isHostOllamaEnabled, isWhisperEnabled, setHostOllamaEnabled, setWhisperEnabled } from '../../utils/settings'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    enableHostOllama?: boolean
    enableWhisper?: boolean
  }>(event)
  if (typeof body?.enableHostOllama === 'boolean') {
    setHostOllamaEnabled(body.enableHostOllama)
  }
  if (typeof body?.enableWhisper === 'boolean') {
    await setWhisperEnabled(body.enableWhisper)
  }
  return {
    enableHostOllama: isHostOllamaEnabled(),
    enableWhisper: isWhisperEnabled(),
  }
})
