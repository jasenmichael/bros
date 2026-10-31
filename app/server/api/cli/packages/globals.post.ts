import { adoptGlobalPackage } from '../../../utils/cli/globals'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ kind?: string; spec?: string }>(event)
  try {
    const pkg = adoptGlobalPackage(body?.kind || '', body?.spec || '')
    return { id: pkg.id, kind: pkg.kind, spec: pkg.spec }
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode || 500
    throw createError({ statusCode: status, statusMessage: err instanceof Error ? err.message : 'Adopt failed' })
  }
})
