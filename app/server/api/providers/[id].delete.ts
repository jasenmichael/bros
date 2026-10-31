import { isPopularProvider } from '../../utils/providers/presets'
import { deleteProvider, isSystemProvider } from '../../utils/providers'
import { requireProviderId } from '../../utils/providers/view'

export default defineEventHandler(async (event) => {
  const id = requireProviderId(event)
  if (isSystemProvider(id) || isPopularProvider(id)) {
    throw createError({ statusCode: 400, statusMessage: `Cannot delete built-in ${id} provider` })
  }
  deleteProvider(id)
  return { ok: true }
})
