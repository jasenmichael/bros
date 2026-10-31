import { startPin } from '../../../../utils/desktopPins'

export default defineEventHandler(async (event) => {
  await startPin(getRouterParam(event, 'id') || '')
  return { ok: true }
})
