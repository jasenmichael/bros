import { projectHasContainers, dockerAppRuntime } from '../../utils/docker'
import { hasCliApps, readCliPackages, readRunningAppIds, type CliPackage } from '../../utils/cli/packages'
import { guiAppProxyId } from '../../../ui/utils/gui'
import { guiProcessOpen } from '../../utils/docker-app/guiProxy'
import { discoverDockerApps } from '../../utils/docker-app/dockerApps'
import { peekOllamaRestartNotice } from '../../utils/docker-app/ollamaMustRun'
import { viaTunnelFromEvent } from '../../utils/viaTunnel'

function withGuiOpen(packages: CliPackage[]) {
  return packages.map((pkg) => ({
    ...pkg,
    interfaces: (pkg.interfaces || []).map((iface) => {
      if (iface.type !== 'gui' || !iface.command) return iface
      return { ...iface, open: guiProcessOpen(guiAppProxyId(pkg.id, iface.command)) }
    }),
  }))
}

/** Unified Apps store list: docker apps (incl. core) + package apps. */
export default defineEventHandler(async (event) => {
  const { dockerApps, errors } = discoverDockerApps()
  const docker = await Promise.all(dockerApps.map(async (s) => {
    const runtime = await dockerAppRuntime(s)
    let hasContainer = false
    try {
      hasContainer = await projectHasContainers(s.id)
    } catch {
      hasContainer = runtime.status.running
    }
    return {
      role: 'docker' as const,
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
    }
  }))

  const running = new Set(readRunningAppIds())
  const packages = hasCliApps()
    ? withGuiOpen(readCliPackages()).map((pkg) => ({
        role: 'package' as const,
        ...pkg,
        ...(pkg.services?.length ? { serviceRunning: pkg.enabled !== false && running.has(pkg.id) } : {}),
      }))
    : []

  return {
    apps: [...docker, ...packages],
    docker,
    packages,
    errors,
    viaTunnel: viaTunnelFromEvent(event),
    ollamaRestartNotice: peekOllamaRestartNotice(),
  }
})
