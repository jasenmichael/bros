import { closeDesktopEntry, openDesktopEntry } from '../../utils/desktopPins'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: string, close?: boolean }>(event).catch((): { id?: string, close?: boolean } => ({}))
  if (body?.close) await closeDesktopEntry(body.id || '')
  else await openDesktopEntry(body.id || '')
  return { ok: true }
})
