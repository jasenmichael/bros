import { persistProviderAndSyncChat, setProviderEnabled, getProvider } from '../../utils/providers'
import { requireProviderId } from '../../utils/providersView'

export default defineEventHandler(async (event) => {
  const id = requireProviderId(event)
  const existing = getProvider(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Provider not found' })

  const body = await readBody<{
    enabled?: boolean
    name?: string
    apiKey?: string | null
    baseUrl?: string | null
    config?: Record<string, unknown>
  }>(event)

  const hasDetails = body?.name != null
    || body?.apiKey !== undefined
    || body?.baseUrl !== undefined
    || body?.config != null

  if (hasDetails) {
    return persistProviderAndSyncChat({
      id,
      name: typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : existing.name,
      kind: existing.kind,
      baseUrl: body?.baseUrl !== undefined ? body.baseUrl : existing.baseUrl,
      apiKey: body?.apiKey,
      enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
      config: body?.config,
    })
  }

  if (typeof body?.enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'enabled boolean required' })
  }
  return await setProviderEnabled(id, body.enabled)
})
