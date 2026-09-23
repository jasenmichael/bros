export const CHAT_MODEL_MEMORY_KEY = 'bros-chat-model'

export type ChatModelMemory = {
  lastProviderId: string
  models: Record<string, string>
}

export const CHAT_MODEL_MEMORY_DEFAULTS: ChatModelMemory = {
  lastProviderId: 'ollama',
  models: {},
}

function emptyMemory(): ChatModelMemory {
  return {
    lastProviderId: CHAT_MODEL_MEMORY_DEFAULTS.lastProviderId,
    models: {},
  }
}

function modelMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const models: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key && typeof value === 'string' && value) models[key] = value
  }
  return models
}

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null
    return localStorage
  } catch {
    return null
  }
}

export function readChatModelMemory(): ChatModelMemory {
  try {
    const raw = browserStorage()?.getItem(CHAT_MODEL_MEMORY_KEY)
    if (!raw) return emptyMemory()
    const parsed = JSON.parse(raw) as Partial<ChatModelMemory>
    const lastProviderId = typeof parsed.lastProviderId === 'string' && parsed.lastProviderId
      ? parsed.lastProviderId
      : CHAT_MODEL_MEMORY_DEFAULTS.lastProviderId
    return { lastProviderId, models: modelMap(parsed.models) }
  } catch {
    return emptyMemory()
  }
}

export function writeChatModelMemory(state: ChatModelMemory) {
  const storage = browserStorage()
  if (!storage) return
  storage.setItem(CHAT_MODEL_MEMORY_KEY, JSON.stringify({
    lastProviderId: state.lastProviderId,
    models: state.models,
  }))
}

export function rememberChatProvider(providerId: string) {
  if (!providerId) return readChatModelMemory()
  const next = readChatModelMemory()
  next.lastProviderId = providerId
  writeChatModelMemory(next)
  return next
}

export function rememberChatModel(providerId: string, modelName: string) {
  if (!providerId || !modelName) return readChatModelMemory()
  const next = readChatModelMemory()
  next.lastProviderId = providerId
  next.models = { ...next.models, [providerId]: modelName }
  writeChatModelMemory(next)
  return next
}
