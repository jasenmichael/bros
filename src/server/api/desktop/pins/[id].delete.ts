import { removePin } from '../../../utils/desktopPins'

export default defineEventHandler((event) => {
  removePin(getRouterParam(event, 'id') || '')
  return { ok: true }
})
