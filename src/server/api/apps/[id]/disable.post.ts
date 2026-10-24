import { applyCliPackages, disableAddonApp, readCliPackages } from '../../../utils/cli/packages'
import { stagePackageRemoval } from '../../../utils/cli/ensure'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  try {
    const pkg = readCliPackages().find((row) => row.id === id)
    disableAddonApp(id)
    if (pkg) stagePackageRemoval(pkg)
    const install = await applyCliPackages()
    return { packages: readCliPackages(), install }
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode || 500
    throw createError({ statusCode: status, statusMessage: err instanceof Error ? err.message : 'Disable failed' })
  }
})
