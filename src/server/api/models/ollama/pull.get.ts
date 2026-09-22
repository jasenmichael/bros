import { sendMoved } from '../../../utils/apiRedirect'
import { OLLAMA_SIDECAR_ID } from '../../../utils/providers'

export default defineEventHandler((event) => {
  const providerId = String(getQuery(event).providerId || OLLAMA_SIDECAR_ID)
  return sendMoved(event, `/api/providers/${providerId}/models/pull`)
})
