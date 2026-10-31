import { clearJob } from '../../../utils/agents/loop'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') || ''
  try {
    clearJob(id)
  }
  catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'bad request',
    })
  }
  return { ok: true }
})
