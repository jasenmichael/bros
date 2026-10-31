import { validRepoName } from '../../../utils/agents/rules'
import { removeAgentProject } from '../../../utils/agents/store'

export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'name') || ''
  if (!validRepoName(name)) throw createError({ statusCode: 400, statusMessage: 'invalid repo name' })
  try {
    removeAgentProject(name)
  }
  catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'bad project' })
  }
  return { ok: true }
})
