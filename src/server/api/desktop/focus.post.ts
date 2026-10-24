import { focusLibraryApp } from '../../utils/desktopPins'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ kind?: string, id?: string, command?: string }>(event).catch(() => null)
  await focusLibraryApp(body || {})
  return { ok: true }
})
