import { assertOllamaAutostartLocked } from '../../../utils/ollamaMustRun'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{
    autostart?: boolean
    navPinned?: boolean
    hostProbePort?: number | null
  }>(event)
  assertOllamaAutostartLocked(id, body?.autostart)
  if (body?.navPinned) {
    const { getSidecar } = await import('../../../utils/sidecars')
    const sidecar = getSidecar(id)
    const hasWebUi = sidecar?.interfaces.some((iface) => iface.type === 'webui' && typeof iface.publish === 'number' && iface.publish > 0)
    if (!hasWebUi) {
      throw createError({ statusCode: 400, statusMessage: 'Pin requires a published web UI' })
    }
  }
  const { setSidecarSetting } = await import('../../../utils/docker')
  return setSidecarSetting(id, {
    autostart: body?.autostart,
    navPinned: body?.navPinned,
    hostProbePort: body && 'hostProbePort' in body ? body.hostProbePort : undefined,
  })
})
