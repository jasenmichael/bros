import { writeCustomSidecar } from '../../utils/sidecars'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    id?: string
    sidecarYml?: string
    composeYml?: string
  }>(event)
  if (!body?.id || !body.sidecarYml || !body.composeYml) {
    throw createError({ statusCode: 400, statusMessage: 'id, sidecarYml, and composeYml required' })
  }
  return writeCustomSidecar({
    id: body.id,
    sidecarYml: body.sidecarYml,
    composeYml: body.composeYml,
  })
})
