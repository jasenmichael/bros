export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const query = getQuery(event)
  const tail = Number(query.tail) || 200
  const { sidecarLogs } = await import('../../../utils/docker')
  return sidecarLogs(id, tail)
})
