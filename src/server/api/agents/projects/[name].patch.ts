import { validRepoName } from '../../../utils/agents/rules'
import { updateAgentProject } from '../../../utils/agents/store'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name') || ''
  if (!validRepoName(name)) throw createError({ statusCode: 400, statusMessage: 'invalid repo name' })
  const body = await readBody<{ defaultBranch?: string, path?: string, enabled?: boolean, prBase?: string }>(event)
  try {
    return updateAgentProject(name, body || {})
  }
  catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'bad project' })
  }
})
