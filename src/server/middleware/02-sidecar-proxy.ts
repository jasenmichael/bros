import { handleSidecarRequest } from '../utils/sidecarProxy'

/**
 * Allowlist path proxy: first segment must be a discovered sidecar id with
 * `proxy.public`. `/chat` and other Bros routes fall through.
 */
export default defineEventHandler((event) => handleSidecarRequest(event))
