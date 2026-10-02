export const CHAT_PREPEND_KEY = 'bros-chat-prepend'
export const CHAT_ASSISTANT_DESCRIPTION_KEY = 'bros-chat-assistant-description'

export type ChatSettings = {
  prepend: string
  assistantDescription: string
}

export type ChatHistoryMessage = { role: string; content: string }

export function chatSettingsFromBody(body: {
  chatPrepend?: string
  chatAssistantDescription?: string
} | null | undefined): ChatSettings {
  return {
    prepend: typeof body?.chatPrepend === 'string' ? body.chatPrepend : '',
    assistantDescription: typeof body?.chatAssistantDescription === 'string' ? body.chatAssistantDescription : '',
  }
}

/** Provider payload only. Does not mutate stored history. */
export function applyChatSettings(
  history: ChatHistoryMessage[],
  settings: ChatSettings,
): ChatHistoryMessage[] {
  const description = settings.assistantDescription.trim()
  const prepend = settings.prepend.trim()
  const messages = history.map((m) => ({ role: m.role, content: m.content }))

  if (description) {
    const firstSystem = messages.findIndex((m) => m.role === 'system')
    if (firstSystem >= 0) {
      const existing = messages[firstSystem]!.content.trim()
      messages[firstSystem] = {
        role: 'system',
        content: existing && existing !== description ? `${description}\n\n${existing}` : description,
      }
    } else {
      messages.unshift({ role: 'system', content: description })
    }
  }

  if (prepend) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'user') {
        messages[i] = { role: 'user', content: `${prepend}\n\n${messages[i]!.content}` }
        break
      }
    }
  }

  return messages
}
