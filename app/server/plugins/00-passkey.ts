import { ensurePasskey, ensureProxyKey } from '../utils/auth'
import { ensureSessionSecret } from '../utils/config'

/**
 * Print / create `{dataDir}/passkey` as soon as Nitro boots (before first request).
 */
export default defineNitroPlugin(() => {
  try {
    ensurePasskey()
    ensureProxyKey()
    ensureSessionSecret()
  } catch (err) {
    console.error('[bros] passkey bootstrap failed', err)
  }
})
