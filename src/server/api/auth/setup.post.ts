import { createSession, hasPasscode, setPasscode, SESSION_COOKIE } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  if (hasPasscode()) {
    throw createError({ statusCode: 400, statusMessage: 'Passcode already set' })
  }
  const body = await readBody<{ passcode?: string }>(event)
  if (!body?.passcode) throw createError({ statusCode: 400, statusMessage: 'passcode required' })
  setPasscode(body.passcode)
  const token = createSession()
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  })
  return { ok: true }
})
