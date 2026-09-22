import { discoverSidecars } from '../../utils/sidecars'
import { projectHasContainers, sidecarRuntime } from '../../utils/docker'
import { peekOllamaRestartNotice } from '../../utils/ollamaMustRun'
import { viaTunnelFromEvent } from '../../utils/viaTunnel'

export default defineEventHandler(async (event) => {
  const { sidecars, errors } = discoverSidecars()
  const items = await Promise.all(sidecars.map(async (s) => {
    const runtime = await sidecarRuntime(s)
    let hasContainer = false
    try {
      hasContainer = await projectHasContainers(s.id)
    } catch {
      hasContainer = runtime.status.running
    }
    return {
      ...s,
      settings: runtime.settings,
      status: runtime.status,
      hostPort: runtime.hostPort,
      hostMode: runtime.settings.hostMode,
      effectiveMode: runtime.effectiveMode,
      hostManaged: runtime.hostManaged,
      portOccupied: runtime.portOccupied,
      warning: runtime.warning,
      hostOllama: runtime.hostOllama,
      hostOllamaError: runtime.hostOllamaError,
      hasContainer,
    }
  }))
  return { sidecars: items, errors, viaTunnel: viaTunnelFromEvent(event), ollamaRestartNotice: peekOllamaRestartNotice() }
})
