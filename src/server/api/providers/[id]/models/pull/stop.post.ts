import { isValidOllamaPullName } from '../../../../../utils/ollamaLibrary'
import { refuseInternalBrosModel } from '../../../../../utils/internalBrosModel'
import { getPullJob, stopPullJob } from '../../../../../utils/ollamaPullJobs'
import { requireOllamaProvider } from '../../../../../utils/providersView'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  requireOllamaProvider(id)
  const body = await readBody<{ name?: string; model?: string }>(event)
  const name = (body?.model || body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'model required' })
  if (!isValidOllamaPullName(name)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid Ollama name: ${name}` })
  }
  refuseInternalBrosModel(name)
  const job = stopPullJob(id, name) || getPullJob(id, name)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'No pull job for that model' })
  return { ok: true, job }
})
