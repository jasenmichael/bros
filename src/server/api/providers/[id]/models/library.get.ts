import { customCatalogFromNames, getModelCatalog } from '../../../../utils/ollamaLibrary'
import { ensureDefaultUseGpu, getProvider, listCustomOllamaModels, OLLAMA_SIDECAR_ID } from '../../../../utils/providers'
import { requireOllamaProvider } from '../../../../utils/providersView'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  requireOllamaProvider(id)
  const { gpu, disk, sections } = await getModelCatalog()
  const useGpu = ensureDefaultUseGpu(gpu.available)
  const ollama = getProvider(OLLAMA_SIDECAR_ID)
  const useGpuPreference = Boolean(ollama?.config?.useGpu)
  const custom = customCatalogFromNames(listCustomOllamaModels(id), sections)
  return {
    gpu,
    disk: {
      path: disk.path,
      freeBytes: Number.isFinite(disk.freeBytes) ? disk.freeBytes : null,
      totalBytes: disk.totalBytes || null,
    },
    useGpu,
    useGpuPreference,
    sections: { ...sections, custom },
  }
})
