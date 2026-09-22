import { setChatSettings } from '../../utils/chatSettings'
import { isHostOllamaEnabled, setHostOllamaEnabled } from '../../utils/hostOllamaSettings'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    chatPrepend?: string
    chatAssistantDescription?: string
    enableHostOllama?: boolean
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
  return {
    chatPrepend: chat.prepend,
    chatAssistantDescription: chat.assistantDescription,
    enableHostOllama: isHostOllamaEnabled(),
  }
})