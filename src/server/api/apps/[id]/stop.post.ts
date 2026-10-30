import { assertDockerAppUiActionAllowed } from '../../../utils/docker-app/ollamaMustRun'
import { cloudflaredStopBlocked, TUNNEL_STOP_LOCKED_MESSAGE, viaTunnelFromEvent } from '../../../utils/viaTunnel'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  assertDockerAppUiActionAllowed(id, 'stop')
  if (cloudflaredStopBlocked(id, viaTunnelFromEvent(event))) {
    throw createError({ statusCode: 403, statusMessage: TUNNEL_STOP_LOCKED_MESSAGE })
  }
  const body = await readBody<{ gui?: boolean, one?: boolean }>(event).catch(() => ({ gui: false as const }))
  const { closeGuiWindow, getProjectStatus, stopGuiSession, stopDockerApp } = await import('../../../utils/docker')
  if (body?.gui) {
    const { getDockerApp } = await import('../../../utils/docker-app/dockerApps')
    const dockerApp = getDockerApp(id)
    if (!dockerApp) throw createError({ statusCode: 404, statusMessage: 'DockerApp not found' })
    if (body.one) await closeGuiWindow(id)
    else await stopGuiSession(id)
    return getProjectStatus(dockerApp)
  }
  return stopDockerApp(id)
})
