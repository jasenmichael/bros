import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb, meta } from './db'

export const ENABLE_HOST_OLLAMA_KEY = 'enable_host_ollama'

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

/** Default off. Missing key is off. */
export function isHostOllamaEnabled(): boolean {
  return metaValue(ENABLE_HOST_OLLAMA_KEY) === '1'
}

export function setHostOllamaEnabled(enabled: boolean): boolean {
  setMetaValue(ENABLE_HOST_OLLAMA_KEY, enabled ? '1' : '0')
  return isHostOllamaEnabled()
}

export function assertHostOllamaVisible(id: string) {
  if (id === 'ollama-host' && !isHostOllamaEnabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }
}
