import { assertSidecarUiActionAllowed } from '../../../utils/sidecars/ollamaMustRun'
import { cloudflaredStopBlocked, TUNNEL_STOP_LOCKED_MESSAGE, viaTunnelFromEvent } from '../../../utils/viaTunnel'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  assertSidecarUiActionAllowed(id, 'stop')
  if (cloudflaredStopBlocked(id, viaTunnelFromEvent(event))) {
    throw createError({ statusCode: 403, statusMessage: TUNNEL_STOP_LOCKED_MESSAGE })
  }
  const body = await readBody<{ gui?: boolean }>(event).catch(() => ({ gui: false as const }))
  const { getProjectStatus, stopGuiSession, stopSidecar } = await import('../../../utils/docker')
  if (body?.gui) {
    const { getSidecar } = await import('../../../utils/sidecars/sidecars')
    const sidecar = getSidecar(id)
    if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
    await stopGuiSession(id)
    return getProjectStatus(sidecar)
  }
  return stopSidecar(id)
})
