import { assertDockerAppUiActionAllowed } from '../../../utils/docker-app/ollamaMustRun'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  assertDockerAppUiActionAllowed(id, 'start')
  const body = await readBody<{ gui?: boolean }>(event).catch(() => ({ gui: false as const }))
  const { ensureDockerAppGui, getProjectStatus, startDockerApp } = await import('../../../utils/docker')
  if (body?.gui) {
    const { getDockerApp } = await import('../../../utils/docker-app/dockerApps')
    const dockerApp = getDockerApp(id)
    if (!dockerApp) throw createError({ statusCode: 404, statusMessage: 'DockerApp not found' })
    if (dockerApp.error) throw createError({ statusCode: 400, statusMessage: dockerApp.error })
    if (!(await getProjectStatus(dockerApp)).running) {
      throw createError({ statusCode: 409, statusMessage: 'DockerApp is not running' })
    }
    await ensureDockerAppGui(id)
    return getProjectStatus(dockerApp)
  }
  return startDockerApp(id)
})
