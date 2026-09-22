import { pullJobsPayload } from '../../../../utils/ollamaPullJobs'
import { requireOllamaProvider } from '../../../../utils/providersView'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  requireOllamaProvider(id)
  return pullJobsPayload(id)
})
