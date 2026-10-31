import { jobEvents } from '../../../utils/agents/loop'
import { getJob } from '../../../utils/agents/store'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') || ''
  const job = getJob(id)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'job not found' })
  return { job, events: jobEvents(id) }
})
