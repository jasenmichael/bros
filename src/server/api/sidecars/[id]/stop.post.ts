export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const { stopSidecar } = await import('../../../utils/docker')
  return stopSidecar(id)
})
