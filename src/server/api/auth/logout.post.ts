import { destroySession, SESSION_COOKIE, sessionCookieOptionsForEvent } from '../../utils/auth'

export default defineEventHandler((event) => {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) destroySession(token)
  deleteCookie(event, SESSION_COOKIE, sessionCookieOptionsForEvent(event))
  return { ok: true }
})
