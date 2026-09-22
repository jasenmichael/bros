import { isValidOllamaPullName } from '../../../../utils/ollamaLibrary'
import { refuseInternalBrosModel } from '../../../../utils/internalBrosModel'
import { getPullJob, stopPullJob } from '../../../../utils/ollamaPullJobs'
import { OLLAMA_SIDECAR_ID } from '../../../../utils/providers'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; model?: string; providerId?: string }>(event)
  const name = (body?.model || body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'model required' })
  if (!isValidOllamaPullName(name)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid Ollama name: ${name}` })
  }
  refuseInternalBrosModel(name)
  const providerId = body?.providerId || OLLAMA_SIDECAR_ID
  const job = stopPullJob(providerId, name) || getPullJob(providerId, name)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'No pull job for that model' })
  return { ok: true, job }
})
