import { listProviderModels, requireProviderId } from '../../../utils/providersView'
import { getProvider } from '../../../utils/providers'

export default defineEventHandler(async (event) => {
  const id = requireProviderId(event)
  if (!getProvider(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }
  return listProviderModels(id)
})
