import { loadBootstrapConfig } from '../../utils/config'
import { projectHasContainers, sidecarLogs, sidecarRuntime } from '../../utils/docker'
import { guiProcessOpen } from '../../utils/sidecars/guiProxy'
import { openCodePassword, passwordFromLogs } from '../../utils/sidecars/opencodePassword'
import { discoverSidecars } from '../../utils/sidecars/sidecars'
import { peekOllamaRestartNotice } from '../../utils/sidecars/ollamaMustRun'
import { viaTunnelFromEvent } from '../../utils/viaTunnel'

export default defineEventHandler(async (event) => {
  const { sidecars, errors } = discoverSidecars()
  let opencodePassword = openCodePassword(loadBootstrapConfig().dataDir) || undefined
  if (!opencodePassword) {
    try {
      const logs = await sidecarLogs('opencode', 80)
      opencodePassword = passwordFromLogs(logs.logs) || undefined
    }
    catch {
      opencodePassword = undefined
    }
  }
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
      portOccupied: runtime.portOccupied,
      warning: runtime.warning,
      hostOllama: runtime.hostOllama,
      hostOllamaError: runtime.hostOllamaError,
      hasContainer,
      cli: runtime.cli,
      guiSession: guiProcessOpen(s.id),
      ...(s.id === 'opencode' && opencodePassword ? { password: opencodePassword } : {}),
    }
  }))
  return { sidecars: items, errors, viaTunnel: viaTunnelFromEvent(event), ollamaRestartNotice: peekOllamaRestartNotice() }
})
