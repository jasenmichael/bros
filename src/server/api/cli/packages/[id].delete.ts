import { applyCliPackages, readCliPackages, readStoredPackages, writeCliPackages } from '../../../utils/cli/packages'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const current = readStoredPackages()
  if (!current.some((row) => row.id === id)) {
    throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  }
  const packages = current.filter((row) => row.id !== id)
  writeCliPackages(packages)
  try {
    const install = await applyCliPackages()
    return { packages: readCliPackages(), install }
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode || 500
    throw createError({ statusCode: status, statusMessage: err instanceof Error ? err.message : 'Rebuild failed' })
  }
})
