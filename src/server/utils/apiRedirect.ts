import type { H3Event } from 'h3'

export function sendMoved(event: H3Event, to: string, statusCode: 301 | 308 = 301) {
  const url = getRequestURL(event)
  const dest = to.includes('?') ? to : `${to}${url.search || ''}`
  return sendRedirect(event, dest, statusCode)
}
