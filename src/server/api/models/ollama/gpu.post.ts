import { detectGpu } from '../../../utils/gpu'
import { getProvider, upsertProvider } from '../../../utils/providers'
import { restartSidecar } from '../../../utils/docker'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ useGpu?: boolean; restart?: boolean }>(event)
  const gpu = await detectGpu()
  if (body?.useGpu && !gpu.available) {
    throw createError({ statusCode: 400, statusMessage: 'No GPU detected on host' })
  }

  const existing = getProvider('ollama')
  const config = { ...(existing?.config || {}), useGpu: Boolean(body?.useGpu) }
  upsertProvider({
    id: 'ollama',
    name: existing?.name || 'Ollama sidecar',
    kind: 'ollama',
    baseUrl: existing?.baseUrl,
    config,
  })

  let restarted = false
  if (body?.restart !== false) {
    try {
      await restartSidecar('ollama')
      restarted = true
    } catch (err) {
      // Sidecar may be stopped — preference still saved
      console.error('ollama restart after GPU toggle failed', err)
    }
  }

  return {
    useGpu: Boolean(body?.useGpu),
    gpu,
    restarted,
  }
})
