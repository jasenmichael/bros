import { stopAppGui } from '../../../utils/cli/packages'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<{ command?: string }>(event).catch(() => ({ command: undefined }))
  await stopAppGui(id, body?.command)
  return { ok: true }
})
