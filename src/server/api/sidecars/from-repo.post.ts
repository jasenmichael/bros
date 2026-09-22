import { cloneSidecarRepo } from '../../utils/sidecars'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ url?: string; name?: string }>(event)
  if (!body?.url) throw createError({ statusCode: 400, statusMessage: 'url required' })
  return cloneSidecarRepo({ url: body.url, name: body.name })
})
