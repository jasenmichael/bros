import {
  DISK_MARGIN_BYTES,
  findCatalogModel,
  formatSizeBytes,
  getModelCatalog,
  isValidOllamaPullName,
  modelFitsDisk,
} from '../../../utils/ollamaLibrary'
import { getDiskSpace } from '../../../utils/disk'
import { refuseInternalBrosModel } from '../../../utils/internalBrosModel'
import {
  ollamaBaseUrlFor,
  pullOllamaModelStreamWithRetry,
  rememberCustomOllamaModel,
  OLLAMA_HOST_ID,
  OLLAMA_SIDECAR_ID,
} from '../../../utils/providers'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; model?: string; providerId?: string }>(event)
  const name = (body?.model || body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'model required' })
  if (!isValidOllamaPullName(name)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid Ollama name: ${name}` })
  }
  refuseInternalBrosModel(name)

  const providerId = body?.providerId || OLLAMA_SIDECAR_ID
  rememberCustomOllamaModel(name, providerId)

  if (providerId !== OLLAMA_HOST_ID) {
    await getModelCatalog()
    const disk = getDiskSpace()
    const known = findCatalogModel(name)
    if (known?.sizeBytes && !modelFitsDisk(known.sizeBytes, disk.freeBytes)) {
      const need = formatSizeBytes(known.sizeBytes + DISK_MARGIN_BYTES)
      const free = formatSizeBytes(disk.freeBytes)
      throw createError({
        statusCode: 400,
        statusMessage: `Not enough disk space: ${name} needs ~${need} (incl. margin), only ${free} free on ${disk.path}`,
      })
    }
  }

  setResponseHeader(event, 'content-type', 'application/x-ndjson; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-cache')
  setResponseHeader(event, 'x-accel-buffering', 'no')

  const res = event.node.res
  try {
    for await (const evt of pullOllamaModelStreamWithRetry(await ollamaBaseUrlFor(providerId), name)) {
      if (evt.error) {
        res.write(`${JSON.stringify({ status: 'error', error: evt.error })}\n`)
        break
      }
      res.write(`${JSON.stringify(evt)}\n`)
      if (typeof (res as { flush?: () => void }).flush === 'function') {
        ;(res as { flush: () => void }).flush()
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      throw createError({ statusCode: 502, statusMessage: message })
    }
    res.write(`${JSON.stringify({ status: 'error', error: message })}\n`)
  }
  res.end()
  event._handled = true
})
