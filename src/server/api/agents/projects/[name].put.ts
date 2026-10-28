import { validRepoName } from '../../../utils/agents/rules'
import { setProjectPrBase } from '../../../utils/agents/store'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name') || ''
  if (!validRepoName(name)) throw createError({ statusCode: 400, statusMessage: 'invalid repo name' })
  const body = await readBody<{ prBase?: string }>(event)
  return { name, prBase: setProjectPrBase(name, body?.prBase || '') }
})
