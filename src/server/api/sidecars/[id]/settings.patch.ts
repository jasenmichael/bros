import { isHostMode } from '../../../utils/hostProbe'
import { assertOllamaAutostartLocked } from '../../../utils/ollamaMustRun'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{
    autostart?: boolean
    navPinned?: boolean
    hostMode?: string
    hostProbePort?: number | null
  }>(event)
  assertOllamaAutostartLocked(id, body?.autostart)
  if (body?.hostMode != null && !isHostMode(body.hostMode)) {
    throw createError({ statusCode: 400, statusMessage: 'hostMode must be auto, sidecar, or host' })
  }
  const { setSidecarSetting } = await import('../../../utils/docker')
  return setSidecarSetting(id, {
    autostart: body?.autostart,
    navPinned: body?.navPinned,
    hostMode: body?.hostMode && isHostMode(body.hostMode) ? body.hostMode : undefined,
    hostProbePort: body && 'hostProbePort' in body ? body.hostProbePort : undefined,
  })
})
