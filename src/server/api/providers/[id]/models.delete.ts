import { refuseInternalBrosModel } from '../../../utils/internalBrosModel'
import { getPullJob, removePullJob, stopPullJob } from '../../../utils/ollamaPullJobs'
import { deleteOllamaModel, ollamaBaseUrlFor } from '../../../utils/providers'
import { requireOllamaProvider } from '../../../utils/providersView'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  requireOllamaProvider(id)
  const body = await readBody<{ name?: string }>(event)
  const name = (body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name required' })
  refuseInternalBrosModel(name)
  const job = getPullJob(id, name)
  if (job?.phase === 'running') stopPullJob(id, name)
  try {
    const result = await deleteOllamaModel(await ollamaBaseUrlFor(id), name)
    removePullJob(id, name)
    return result
  }
  catch (err) {
    if (job && job.phase !== 'done') {
      removePullJob(id, name)
      return {
        ok: true,
        deleted: false,
        limit: 'Ollama /api/delete may not remove incomplete blobs; the pull job was dropped.',
      }
    }
    throw err
  }
})
