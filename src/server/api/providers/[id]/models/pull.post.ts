import {
  DISK_MARGIN_BYTES,
  findCatalogModel,
  formatSizeBytes,
  getModelCatalog,
  isValidOllamaPullName,
  modelFitsDisk,
} from '../../../../utils/ollamaLibrary'
import { getDiskSpace } from '../../../../utils/disk'
import { refuseInternalBrosModel } from '../../../../utils/internalBrosModel'
import { createOrReusePullJob, startPullRunner } from '../../../../utils/ollamaPullJobs'
import { rememberCustomOllamaModel, OLLAMA_HOST_ID } from '../../../../utils/providers'
import { requireOllamaProvider } from '../../../../utils/providersView'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  requireOllamaProvider(id)

  const body = await readBody<{ name?: string; model?: string }>(event)
  const name = (body?.model || body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'model required' })
  if (!isValidOllamaPullName(name)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid Ollama name: ${name}` })
  }
  refuseInternalBrosModel(name)
  rememberCustomOllamaModel(name, id)

  if (id !== OLLAMA_HOST_ID) {
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

  const { created, job } = createOrReusePullJob(id, name)
  if (created && job.phase === 'running') {
    startPullRunner(id, name)
  }

  return { ok: true, job }
})
