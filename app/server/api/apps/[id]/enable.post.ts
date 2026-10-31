import { applyCliPackages, enableAddonApp, readCliPackages } from '../../../utils/cli/packages'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  try {
    enableAddonApp(id)
    const install = await applyCliPackages()
    return { packages: readCliPackages(), install }
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode || 500
    throw createError({ statusCode: status, statusMessage: err instanceof Error ? err.message : 'Enable failed' })
  }
})
