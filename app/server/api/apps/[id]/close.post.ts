import { closeAppGui, stopAppGui } from '../../../utils/cli/packages'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<{ command?: string, one?: boolean }>(event).catch((): { command?: string, one?: boolean } => ({}))
  if (body?.one) await closeAppGui(id, body.command)
  else await stopAppGui(id, body?.command)
  return { ok: true }
})
