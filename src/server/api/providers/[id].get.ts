import { buildProvidersView, requireProviderId } from '../../utils/providersView'
import { getProvider } from '../../utils/providers'

export default defineEventHandler(async (event) => {
  const id = requireProviderId(event)
  if (!getProvider(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }
  const view = await buildProvidersView()
  const provider = view.providers.find((p) => p.id === id)
  if (!provider) throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  return { provider }
})
