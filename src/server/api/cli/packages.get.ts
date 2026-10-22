import { guiAppProxyId } from '../../../ui/utils/gui'
import { guiProcessOpen } from '../../utils/sidecars/guiProxy'
import { managerForms } from '../../utils/cli/managers'
import { hasCliApps, readCliPackages, readRunningAppIds, type CliPackage } from '../../utils/cli/packages'

function withGuiOpen(packages: CliPackage[]) {
  return packages.map((pkg) => ({
    ...pkg,
    interfaces: (pkg.interfaces || []).map((iface) => {
      if (iface.type !== 'gui' || !iface.command) return iface
      return { ...iface, open: guiProcessOpen(guiAppProxyId(pkg.id, iface.command)) }
    }),
  }))
}

export default defineEventHandler(() => {
  const packages = hasCliApps() ? readCliPackages() : []
  const running = new Set(readRunningAppIds())
  return {
    packages: withGuiOpen(packages).map((pkg) => ({
      ...pkg,
      ...(pkg.services?.length ? { serviceRunning: pkg.enabled !== false && running.has(pkg.id) } : {}),
    })),
    managers: managerForms(),
  }
})
