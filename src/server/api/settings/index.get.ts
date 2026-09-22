import { loadBootstrapConfig } from '../../utils/config'
import { hasPasscode } from '../../utils/auth'
import { getChatSettings } from '../../utils/chatSettings'
import { isHostOllamaEnabled } from '../../utils/hostOllamaSettings'

export default defineEventHandler(() => {
  const cfg = loadBootstrapConfig()
  const chat = getChatSettings()
  return {
    workingDir: cfg.workingDir,
    dataDir: cfg.dataDir,
    hasPasscode: hasPasscode(),
    chatPrepend: chat.prepend,
    chatAssistantDescription: chat.assistantDescription,
    enableHostOllama: isHostOllamaEnabled(),
  }
})
