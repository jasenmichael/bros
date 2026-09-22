import { refuseInternalBrosModel } from '../../../utils/internalBrosModel'
import { getPullJob, removePullJob, stopPullJob } from '../../../utils/ollamaPullJobs'
import { deleteOllamaModel, ollamaBaseUrlFor, OLLAMA_SIDECAR_ID } from '../../../utils/providers'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; model?: string; providerId?: string }>(event)
  const name = (body?.model || body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'model required' })
  refuseInternalBrosModel(name)
  const providerId = body?.providerId || OLLAMA_SIDECAR_ID
  const job = getPullJob(providerId, name)
  if (job?.phase === 'running') stopPullJob(providerId, name)
  try {
    const result = await deleteOllamaModel(await ollamaBaseUrlFor(providerId), name)
    removePullJob(providerId, name)
    return result
  }
  catch (err) {
    if (job && job.phase !== 'done') {
      removePullJob(providerId, name)
      return {
        ok: true,
        deleted: false,
        limit: 'Ollama /api/delete may not remove incomplete blobs; the pull job was dropped.',
      }
    }
    throw err
  }
})
