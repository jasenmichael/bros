import { getSidecar, readSidecarFiles } from '../../../utils/sidecars'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const sidecar = getSidecar(id)
  if (!sidecar) throw createError({ statusCode: 404, statusMessage: `Sidecar "${id}" not found` })
  return { ...readSidecarFiles(id), editable: sidecar.editable, source: sidecar.source }
})
