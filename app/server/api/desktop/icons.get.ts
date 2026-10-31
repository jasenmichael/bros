import { send } from 'h3'
import { readDesktopIcon } from '../../utils/desktopEntryIo'

export default defineEventHandler(async (event) => {
  const name = getQuery(event).name
  const icon = await readDesktopIcon(typeof name === 'string' ? name : '')
  if (!icon) throw createError({ statusCode: 404, statusMessage: 'Icon not found' })
  setHeader(event, 'content-type', icon.mime)
  setHeader(event, 'cache-control', 'no-store')
  return send(event, icon.body)
})
