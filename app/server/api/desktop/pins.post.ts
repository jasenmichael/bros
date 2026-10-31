import { addPin } from '../../utils/desktopPins'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: string, kind?: string, command?: string }>(event).catch((): { id?: string, kind?: string, command?: string } => ({}))
  const pin = await addPin({ id: body?.id || '', kind: body?.kind, command: body?.command })
  return { pin }
})
