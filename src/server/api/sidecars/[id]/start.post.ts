import { assertSidecarUiActionAllowed } from '../../../utils/sidecars/ollamaMustRun'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  assertSidecarUiActionAllowed(id, 'start')
  const body = await readBody<{ gui?: boolean }>(event).catch(() => ({ gui: false as const }))
  const { ensureSidecarGui, getProjectStatus, startSidecar } = await import('../../../utils/docker')
  if (body?.gui) {
    const { getSidecar } = await import('../../../utils/sidecars/sidecars')
    const sidecar = getSidecar(id)
    if (!sidecar) throw createError({ statusCode: 404, statusMessage: 'Sidecar not found' })
    if (sidecar.error) throw createError({ statusCode: 400, statusMessage: sidecar.error })
    if (!(await getProjectStatus(sidecar)).running) {
      throw createError({ statusCode: 409, statusMessage: 'Sidecar is not running' })
    }
    await ensureSidecarGui(id)
    return getProjectStatus(sidecar)
  }
  return startSidecar(id)
})
