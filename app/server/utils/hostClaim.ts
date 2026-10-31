import { chownSync } from 'node:fs'

const NUM = /^\d+$/

/**
 * When Nitro runs as root (bros-ui) and BROS_HOST_UID/GID are set, claim the file
 * so the host user can read passkey and other 0600 secrets.
 */
export function claimForHost(path: string) {
  if (typeof process.getuid === 'function' && process.getuid() !== 0) return
  const uid = process.env.BROS_HOST_UID?.trim() || ''
  const gid = process.env.BROS_HOST_GID?.trim() || ''
  if (!NUM.test(uid) || !NUM.test(gid)) return
  try {
    chownSync(path, Number(uid), Number(gid))
  }
  catch {
    // Best-effort: login still works from container logs if chown fails.
  }
}
