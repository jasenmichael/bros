import { deleteProvider, isPopularProvider, isSystemProvider } from '../../../utils/providers'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  if (isSystemProvider(id) || isPopularProvider(id)) {
    throw createError({ statusCode: 400, statusMessage: `Cannot delete built-in ${id} provider` })
  }
  deleteProvider(id)
  return { ok: true }
})
