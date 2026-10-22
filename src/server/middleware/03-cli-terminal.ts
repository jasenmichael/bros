import { isCliTerminalPath, proxyCliTerminalHttp } from '../utils/cli/terminalProxy'
import { ensureAppsRunning } from '../utils/docker'

export default defineEventHandler(async (event) => {
  if (!isCliTerminalPath(getRequestURL(event).pathname)) return
  await ensureAppsRunning()
  return proxyCliTerminalHttp(event)
})