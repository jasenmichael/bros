import { approveImplement, cancelJob, runApprovePr } from '../../../../utils/agents/loop'
import { getJob } from '../../../../utils/agents/store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<{ action?: string, taskSpec?: unknown }>(event)
  try {
    if (body?.action === 'approve') return await approveImplement(id, body.taskSpec)
    if (body?.action === 'approve_pr') return await runApprovePr(id)
    if (body?.action === 'cancel') {
      cancelJob(id)
      return getJob(id)
    }
  }
  catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'bad request',
    })
  }
  throw createError({ statusCode: 400, statusMessage: 'action required' })
})
