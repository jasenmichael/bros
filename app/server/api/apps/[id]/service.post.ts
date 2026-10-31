import { restartAppService, setAppService } from '../../../utils/cli/packages'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<{ action?: string }>(event).catch(() => ({ action: undefined }))
  if (body?.action !== 'start' && body?.action !== 'stop' && body?.action !== 'restart') {
    throw createError({ statusCode: 400, statusMessage: 'action must be start, stop, or restart' })
  }
  try {
    if (body.action === 'restart') return restartAppService(id)
    return setAppService(id, body.action === 'start')
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode || 500
    throw createError({ statusCode: status, statusMessage: err instanceof Error ? err.message : 'Service failed' })
  }
})
