import { handleDockerAppRequest } from '../utils/docker-app/dockerAppProxy'

/**
 * Allowlist path proxy. Web UIs need `proxy.public`. `api` and `openai`
 * interfaces strip `/${id}` and forward `basePath`. `/chat` falls through.
 */
export default defineEventHandler((event) => handleDockerAppRequest(event))
