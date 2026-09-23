import { setChatSettings } from '../../utils/chatSettings'
import { isHostOllamaEnabled, setHostOllamaEnabled } from '../../utils/hostOllamaSettings'
import { isWhisperEnabled, setWhisperEnabled } from '../../utils/whisperSettings'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    chatPrepend?: string
    chatAssistantDescription?: string
    enableHostOllama?: boolean
    enableWhisper?: boolean
  }>(event)
  const chat = setChatSettings({
    prepend: typeof body?.chatPrepend === 'string' ? body.chatPrepend : undefined,
    assistantDescription: typeof body?.chatAssistantDescription === 'string'
      ? body.chatAssistantDescription
      : undefined,
  })
  if (typeof body?.enableHostOllama === 'boolean') {
    setHostOllamaEnabled(body.enableHostOllama)
  }
  if (typeof body?.enableWhisper === 'boolean') {
    await setWhisperEnabled(body.enableWhisper)
  }
  return {
    chatPrepend: chat.prepend,
    chatAssistantDescription: chat.assistantDescription,
    enableHostOllama: isHostOllamaEnabled(),
    enableWhisper: isWhisperEnabled(),
  }
})