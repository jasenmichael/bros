import { isInternalBrosModel } from '../../../../utils/internalBrosModel'
import { ollamaBaseUrlFor, OLLAMA_HOST_ID } from '../../../../utils/providers'
import { ollamaNameFromModelId, parseOllamaContextLength } from '../../../../utils/chatStats'
import { requireOllamaProvider } from '../../../../utils/providersView'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  requireOllamaProvider(id)
  const query = getQuery(event)
  const model = String(query.model || query.modelId || '').trim()
  const name = ollamaNameFromModelId(model.includes('/') ? model : `${id}/${model}`) || model
  const modelId = model.includes('/') ? model : `${id}/${model}`
  if (!name || isInternalBrosModel(name)) return { modelId, contextLength: null }
  if (id !== 'ollama' && id !== OLLAMA_HOST_ID) {
    return { modelId, contextLength: null }
  }

  try {
    const base = await ollamaBaseUrlFor(id)
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
