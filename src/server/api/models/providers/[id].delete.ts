import { deleteProvider } from '../../../utils/providers'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  if (id === 'ollama') throw createError({ statusCode: 400, statusMessage: 'Cannot delete built-in ollama provider' })
  deleteProvider(id)
  return { ok: true }
})
