import { getRequestURL } from 'h3'
import { isDesktopStreamPath, proxyDesktopHttp } from '../utils/sidecars/guiProxy'

/** `/desktop` is the Vue page. `/desktop/view/` is the Selkies stream. */
export default defineEventHandler((event) => {
  if (!isDesktopStreamPath(getRequestURL(event).pathname)) return
  return proxyDesktopHttp(event)
})
