import { startIssue } from '../../../utils/agents/loop'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ project?: string, issueNumber?: number }>(event)
  if (!body?.project || !Number.isFinite(body.issueNumber)) {
    throw createError({ statusCode: 400, statusMessage: 'project and issueNumber required' })
  }
  try {
    return await startIssue(body.project, Number(body.issueNumber))
  }
  catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'bad request',
    })
  }
})
