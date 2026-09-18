import { ollamaBaseUrlFor, OLLAMA_HOST_ID } from '../../utils/providers'
import { ollamaNameFromModelId, parseOllamaContextLength } from '../../utils/chatStats'

export default defineEventHandler(async (event) => {
  const modelId = String(getQuery(event).modelId || '').trim()
  const name = ollamaNameFromModelId(modelId)
  if (!name) return { modelId, contextLength: null }

  const slash = modelId.indexOf('/')
  const providerId = slash === -1 ? 'ollama' : modelId.slice(0, slash)
  if (providerId !== 'ollama' && providerId !== OLLAMA_HOST_ID) {
    return { modelId, contextLength: null }
  }

  try {
    const base = await ollamaBaseUrlFor(providerId)
    const res = await fetch(`${base.replace(/\/$/, '')}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { modelId, contextLength: null }
    const show = await res.json()
    return { modelId, contextLength: parseOllamaContextLength(show) }
  }
  catch {
    return { modelId, contextLength: null }
  }
})
