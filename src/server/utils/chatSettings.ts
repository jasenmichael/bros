import { eq } from 'drizzle-orm'
import { getDb, meta } from './db'

export const CHAT_PREPEND_KEY = 'chat_prepend'
export const CHAT_ASSISTANT_DESCRIPTION_KEY = 'chat_assistant_description'

export type ChatSettings = {
  prepend: string
  assistantDescription: string
}

export type ChatHistoryMessage = { role: string; content: string }

function metaValue(key: string): string {
  const row = getDb().select().from(meta).where(eq(meta.key, key)).get()
  return row?.value ?? ''
}

function setMetaValue(key: string, value: string) {
  const db = getDb()
  const existing = db.select().from(meta).where(eq(meta.key, key)).get()
  if (existing) {
    db.update(meta).set({ value }).where(eq(meta.key, key)).run()
    return
  }
  db.insert(meta).values({ key, value }).run()
}

export function getChatSettings(): ChatSettings {
  return {
    prepend: metaValue(CHAT_PREPEND_KEY),
    assistantDescription: metaValue(CHAT_ASSISTANT_DESCRIPTION_KEY),
  }
}

export function setChatSettings(next: Partial<ChatSettings>): ChatSettings {
  if (next.prepend !== undefined) setMetaValue(CHAT_PREPEND_KEY, next.prepend)
  if (next.assistantDescription !== undefined) {
    setMetaValue(CHAT_ASSISTANT_DESCRIPTION_KEY, next.assistantDescription)
  }
  return getChatSettings()
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
