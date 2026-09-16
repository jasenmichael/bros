export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const { startSidecar } = await import('../../../utils/docker')
  return startSidecar(id)
})
