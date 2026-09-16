export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ autostart?: boolean; navPinned?: boolean }>(event)
  const { setSidecarSetting } = await import('../../../utils/docker')
  return setSidecarSetting(id, body || {})
})
