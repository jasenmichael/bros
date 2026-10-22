export const CHAT_PREPEND_KEY = 'bros-chat-prepend'
export const CHAT_ASSISTANT_DESCRIPTION_KEY = 'bros-chat-assistant-description'

export type ChatUiPrefs = {
  prepend: string
  assistantDescription: string
}

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null
    return localStorage
  } catch {
    return null
  }
}

export function readChatUiPrefs(): ChatUiPrefs {
  const store = browserStorage()
  return {
    prepend: store?.getItem(CHAT_PREPEND_KEY) ?? '',
    assistantDescription: store?.getItem(CHAT_ASSISTANT_DESCRIPTION_KEY) ?? '',
  }
}

export function writeChatUiPrefs(next: ChatUiPrefs) {
  const store = browserStorage()
  if (!store) return
  store.setItem(CHAT_PREPEND_KEY, next.prepend)
  store.setItem(CHAT_ASSISTANT_DESCRIPTION_KEY, next.assistantDescription)
}

export function chatUiPrefsBody(): { chatPrepend: string, chatAssistantDescription: string } {
  const prefs = readChatUiPrefs()
  return {
    chatPrepend: prefs.prepend,
    chatAssistantDescription: prefs.assistantDescription,
  }
}
