import { closeTerminal, startTerminal, stopTerminal } from '../../utils/desktopPins'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ open?: boolean, close?: boolean }>(event).catch(() => ({ open: true, close: false }))
  if (body?.close) await closeTerminal()
  else if (body?.open === false) await stopTerminal()
  else await startTerminal()
  return { ok: true }
})
