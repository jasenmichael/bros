import { coreContainerLogs } from '../../../utils/docker'

const SERVICE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export default defineEventHandler(async (event) => {
  const service = getRouterParam(event, 'service') || ''
  if (!SERVICE.test(service)) throw createError({ statusCode: 400, statusMessage: 'service required' })
  const query = getQuery(event)
  const tail = Math.min(Math.max(Number(query.tail) || 200, 1), 2000)
  return coreContainerLogs(service, tail)
})
