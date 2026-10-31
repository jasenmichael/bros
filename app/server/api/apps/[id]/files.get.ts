import { getDockerApp, readDockerAppFiles } from '../../../utils/docker-app/dockerApps'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const dockerApp = getDockerApp(id)
  if (!dockerApp) throw createError({ statusCode: 404, statusMessage: `DockerApp "${id}" not found` })
  return { ...readDockerAppFiles(id), editable: dockerApp.editable, source: dockerApp.source }
})
