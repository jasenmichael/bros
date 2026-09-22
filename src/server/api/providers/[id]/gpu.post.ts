import { detectGpu } from '../../../utils/gpu'
import { getProvider, upsertProvider, OLLAMA_SIDECAR_ID } from '../../../utils/providers'
import { restartSidecar } from '../../../utils/docker'
import { requireProviderId } from '../../../utils/providersView'

export default defineEventHandler(async (event) => {
  const id = requireProviderId(event)
  if (id !== OLLAMA_SIDECAR_ID) {
    throw createError({ statusCode: 400, statusMessage: 'GPU is only configurable on the Ollama sidecar' })
  }

  const body = await readBody<{ useGpu?: boolean; restart?: boolean }>(event)
  const gpu = await detectGpu()
  if (body?.useGpu && !gpu.available) {
    throw createError({ statusCode: 400, statusMessage: 'No GPU detected on host' })
  }

  const existing = getProvider(OLLAMA_SIDECAR_ID)
  const config = { ...(existing?.config || {}), useGpu: Boolean(body?.useGpu) }
  upsertProvider({
    id: OLLAMA_SIDECAR_ID,
    name: existing?.name || 'Ollama (core)',
    kind: 'ollama',
    baseUrl: existing?.baseUrl,
    config,
  })

  let restarted = false
  if (body?.restart !== false) {
    try {
      await restartSidecar('ollama')
      restarted = true
    }
    catch (err) {
      console.error('ollama restart after GPU toggle failed', err)
    }
  }

  return {
    useGpu: Boolean(body?.useGpu),
    gpu,
    restarted,
  }
})
