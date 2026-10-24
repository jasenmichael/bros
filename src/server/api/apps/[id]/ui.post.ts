import { applyCliPackages, patchAppUi, readCliPackages } from '../../../utils/cli/packages'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const empty: { forwardHost?: boolean; navPinned?: boolean } = {}
  const body = await readBody<typeof empty>(event).catch(() => empty)
  try {
    const ui = patchAppUi(id, {
      ...(typeof body?.forwardHost === 'boolean' ? { forwardHost: body.forwardHost } : {}),
      ...(typeof body?.navPinned === 'boolean' ? { navPinned: body.navPinned } : {}),
    })
    const install = typeof body?.forwardHost === 'boolean'
      ? await applyCliPackages()
      : { code: 0, stderr: '', rebuild: false }
    return { ui, packages: readCliPackages(), install }
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode || 500
    throw createError({ statusCode: status, statusMessage: err instanceof Error ? err.message : 'Update failed' })
  }
})
