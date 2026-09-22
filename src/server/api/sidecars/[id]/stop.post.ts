import { assertSidecarUiActionAllowed } from '../../../utils/ollamaMustRun'
import { cloudflaredStopBlocked, TUNNEL_STOP_LOCKED_MESSAGE, viaTunnelFromEvent } from '../../../utils/viaTunnel'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  assertSidecarUiActionAllowed(id, 'stop')
  if (cloudflaredStopBlocked(id, viaTunnelFromEvent(event))) {
    throw createError({ statusCode: 403, statusMessage: TUNNEL_STOP_LOCKED_MESSAGE })
  }
  const { stopSidecar } = await import('../../../utils/docker')
  return stopSidecar(id)
})
