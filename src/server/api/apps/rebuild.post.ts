import { applyCliPackages } from '../../utils/cli/packages'

export default defineEventHandler(async () => {
  try {
    return { install: await applyCliPackages({ rebuild: true }) }
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode || 500
    throw createError({ statusCode: status, statusMessage: err instanceof Error ? err.message : 'Rebuild failed' })
  }
})
