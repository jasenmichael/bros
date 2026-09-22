import { saveSidecarFiles } from '../../../utils/sidecars'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ sidecarYml?: string; composeYml?: string }>(event)
  if (!body?.sidecarYml || !body.composeYml) {
    throw createError({ statusCode: 400, statusMessage: 'sidecarYml and composeYml required' })
  }
  return saveSidecarFiles(id, { sidecarYml: body.sidecarYml, composeYml: body.composeYml })
})
