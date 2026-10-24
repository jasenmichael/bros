import { guiAppProxyId } from '../../../ui/utils/gui'
import { loadBootstrapConfig } from '../../utils/config'
import { managerForms } from '../../utils/cli/managers'
import { hasCliApps, prepareDesktopAppBuild, readCliPackages, readRunningAppIds, runBuildPending, type CliPackage } from '../../utils/cli/packages'
import { guiProcessOpen } from '../../utils/sidecars/guiProxy'
import { openCodeServeLogPassword } from '../../utils/sidecars/opencodePassword'

function withGuiOpen(packages: CliPackage[]) {
  return packages.map((pkg) => ({
    ...pkg,
    interfaces: (pkg.interfaces || []).map((iface) => {
      if (iface.type !== 'gui' || !iface.command) return iface
      return { ...iface, open: guiProcessOpen(guiAppProxyId(pkg.id, iface.command)) }
    }),
  }))
}

export default defineEventHandler((event) => {
  const packages = hasCliApps() ? readCliPackages() : []
  const running = new Set(readRunningAppIds())
  let rebuildPending = false
  if (getQuery(event).rebuild === '1') {
    try {
      const prep = prepareDesktopAppBuild()
      rebuildPending = runBuildPending(prep.changed, packages.some((pkg) => pkg.enabled !== false && pkg.kind === 'run'))
    } catch {
      rebuildPending = false
    }
  }
  return {
    rebuildPending,
    packages: withGuiOpen(packages).map((pkg) => ({
      ...pkg,
      ...(pkg.services?.length ? { serviceRunning: pkg.enabled !== false && running.has(pkg.id) } : {}),
      ...(pkg.id === 'opencode' ? { password: openCodeServeLogPassword(loadBootstrapConfig().dataDir) || undefined } : {}),
    })),
    managers: managerForms(),
  }
})
