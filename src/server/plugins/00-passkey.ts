import { ensurePasskey } from '../utils/auth'

/**
 * Print / create `{dataDir}/passkey` as soon as Nitro boots (before first request).
 */
export default defineNitroPlugin(() => {
  try {
    ensurePasskey()
  } catch (err) {
    console.error('[bros] passkey bootstrap failed', err)
  }
})
