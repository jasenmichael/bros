import { assertDockerAppUiActionAllowed } from '../../../utils/docker-app/ollamaMustRun'
import { cloudflaredStopBlocked, TUNNEL_STOP_LOCKED_MESSAGE, viaTunnelFromEvent } from '../../../utils/viaTunnel'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  assertDockerAppUiActionAllowed(id, 'restart')
  if (cloudflaredStopBlocked(id, viaTunnelFromEvent(event))) {
    throw createError({ statusCode: 403, statusMessage: TUNNEL_STOP_LOCKED_MESSAGE })
  }
  const { restartDockerApp } = await import('../../../utils/docker')
  return restartDockerApp(id)
})
