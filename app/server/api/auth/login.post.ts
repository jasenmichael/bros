import { createSession, hasPasscode, SESSION_COOKIE, sessionCookieOptionsForEvent, verifyPasscode } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  if (!hasPasscode()) {
    throw createError({ statusCode: 400, statusMessage: 'Setup required' })
  }
  const body = await readBody<{ passcode?: string }>(event)
  if (!body?.passcode || !verifyPasscode(body.passcode)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid passcode' })
  }
  const token = createSession()
  setCookie(event, SESSION_COOKIE, token, sessionCookieOptionsForEvent(event))
  return { ok: true }
})
