import { readCliPackages, writeAppsCompose } from '../../utils/cli/packages'

export default defineEventHandler(() => {
  writeAppsCompose(readCliPackages())
  return { ok: true }
})
