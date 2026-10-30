import { writeCustomDockerApp } from '../../utils/docker-app/dockerApps'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    id?: string
    configYml?: string
    composeYml?: string
  }>(event)
  if (!body?.id || !body.configYml || !body.composeYml) {
    throw createError({ statusCode: 400, statusMessage: 'id, configYml, and composeYml required' })
  }
  return writeCustomDockerApp({
    id: body.id,
    configYml: body.configYml,
    composeYml: body.composeYml,
  })
})
