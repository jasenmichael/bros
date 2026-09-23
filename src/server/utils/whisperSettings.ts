import { eq } from 'drizzle-orm'
import { getDb, meta } from './db'

export const ENABLE_WHISPER_KEY = 'enable_whisper'

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
export function isWhisperEnabled(): boolean {
  return metaValue(ENABLE_WHISPER_KEY) === '1'
}

const WHISPER_ID = 'whisper'

/**
 * Off: persist `'0'`, then stop a healthy package (stop errors are logged).
 * On: pull images, start the sidecar, then persist `'1'`. A failed pull or start leaves the flag off.
 */
export async function setWhisperEnabled(enabled: boolean): Promise<boolean> {
  if (!enabled) {
    setMetaValue(ENABLE_WHISPER_KEY, '0')
    try {
      const { getSidecar } = await import('./sidecars')
      const sidecar = getSidecar(WHISPER_ID)
      if (sidecar && !sidecar.error) {
        const { stopSidecar } = await import('./docker')
        await stopSidecar(WHISPER_ID)
      }
    } catch (err) {
      console.error('whisper stop failed', err)
    }
    return false
  }

  const { pullSidecarImages, startSidecar } = await import('./docker')
  await pullSidecarImages(WHISPER_ID)
  await startSidecar(WHISPER_ID)
  setMetaValue(ENABLE_WHISPER_KEY, '1')
  return true
}
