import { applyCliPackages, parseCliPackage, readCliPackages, readStoredPackages, writeCliPackages } from '../../../utils/cli/packages'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ kind?: string; spec?: string; bin?: string; args?: string; services?: unknown; uninstall?: unknown }>(event)
  const current = readStoredPackages()
  const prev = current.find((row) => row.id === id)
  if (!prev) {
    throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  }
  const spec = (body?.spec || '').trim()
  if (current.some((row) => row.id !== id && row.kind === body?.kind && row.spec === spec)) {
    throw createError({ statusCode: 400, statusMessage: 'That package is already installed' })
  }
  let parsed
  try {
    parsed = parseCliPackage({
      ...(body || {}),
      ...(!body || !('services' in body) ? { services: prev.services } : {}),
      ...(!body || !('uninstall' in body) ? { uninstall: prev.uninstall } : {}),
    }, current.filter((row) => row.id !== id).map((row) => row.id))
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err instanceof Error ? err.message : 'Invalid package' })
  }
  const packages = current.map((row) => (row.id === id ? { ...parsed, id } : row))
  writeCliPackages(packages)
  try {
    const install = await applyCliPackages()
    return { packages: readCliPackages(), install }
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode || 500
    throw createError({ statusCode: status, statusMessage: err instanceof Error ? err.message : 'Rebuild failed' })
  }
})
