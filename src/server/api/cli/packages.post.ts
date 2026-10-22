import { applyCliPackages, parseCliPackage, readCliPackages, readStoredPackages, writeCliPackages } from '../../utils/cli/packages'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ kind?: string; spec?: string; bin?: string; args?: string }>(event)
  const current = readStoredPackages()
  if (current.some((row) => row.kind === body?.kind && row.spec === (body?.spec || '').trim())) {
    throw createError({ statusCode: 400, statusMessage: 'That package is already installed' })
  }
  let next
  try {
    next = parseCliPackage(body || {}, current.map((row) => row.id))
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err instanceof Error ? err.message : 'Invalid package' })
  }
  const packages = [...current, next]
  writeCliPackages(packages)
  try {
    const install = await applyCliPackages()
    return { packages: readCliPackages(), install }
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode || 500
    throw createError({ statusCode: status, statusMessage: err instanceof Error ? err.message : 'Rebuild failed' })
  }
})
