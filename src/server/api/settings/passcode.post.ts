import { setPasscode } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ passcode?: string }>(event)
  if (!body?.passcode) throw createError({ statusCode: 400, statusMessage: 'passcode required' })
  setPasscode(body.passcode)
  return { ok: true }
})
