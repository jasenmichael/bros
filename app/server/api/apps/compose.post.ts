import { prepareDesktopAppBuild, readCliPackages, writeAppsCompose } from '../../utils/cli/packages'

export default defineEventHandler(() => {
  writeAppsCompose(readCliPackages())
  prepareDesktopAppBuild()
  return { ok: true }
})
