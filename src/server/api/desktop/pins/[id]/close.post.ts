import { closePin } from '../../../../utils/desktopPins'

export default defineEventHandler(async (event) => {
  await closePin(getRouterParam(event, 'id') || '')
  return { ok: true }
})