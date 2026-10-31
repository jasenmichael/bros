import { assertOllamaAutostartLocked } from '../../../utils/docker-app/ollamaMustRun'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{
    autostart?: boolean
    navPinned?: boolean
    hostMode?: string
    exposeHost?: boolean
    hostProbePort?: number | null
  }>(event)
  assertOllamaAutostartLocked(id, body?.autostart)
  if (body?.navPinned) {
    const { getDockerApp } = await import('../../../utils/docker-app/dockerApps')
    const dockerApp = getDockerApp(id)
    const hasWebUi = dockerApp?.interfaces.some((iface) => iface.type === 'webui' && typeof iface.publish === 'number' && iface.publish > 0)
    if (!hasWebUi) {
      throw createError({ statusCode: 400, statusMessage: 'Pin requires a published web UI' })
    }
  }
  const { refreshCliBridges, setDockerAppSetting } = await import('../../../utils/docker')
  const saved = setDockerAppSetting(id, {
    autostart: body?.autostart,
    navPinned: body?.navPinned,
    hostMode: body?.hostMode,
    exposeHost: body?.exposeHost,
    hostProbePort: body && 'hostProbePort' in body ? body.hostProbePort : undefined,
  })
  await refreshCliBridges()
  return saved
})
