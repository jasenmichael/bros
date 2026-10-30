import { saveDockerAppFiles } from '../../../utils/docker-app/dockerApps'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ configYml?: string; composeYml?: string }>(event)
  if (!body?.configYml || !body.composeYml) {
    throw createError({ statusCode: 400, statusMessage: 'configYml and composeYml required' })
  }
  return saveDockerAppFiles(id, { configYml: body.configYml, composeYml: body.composeYml })
})
