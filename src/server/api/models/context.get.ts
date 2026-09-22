import { sendMoved } from '../../utils/apiRedirect'
import { ollamaNameFromModelId } from '../../utils/chatStats'
import { OLLAMA_HOST_ID } from '../../utils/providers'

export default defineEventHandler((event) => {
  const modelId = String(getQuery(event).modelId || '').trim()
  const slash = modelId.indexOf('/')
  const providerId = slash === -1 ? 'ollama' : modelId.slice(0, slash)
  const id = providerId === 'ollama' || providerId === OLLAMA_HOST_ID ? providerId : 'ollama'
  const name = ollamaNameFromModelId(modelId) || modelId
  return sendMoved(event, `/api/providers/${id}/models/context?model=${encodeURIComponent(name)}`)
})
