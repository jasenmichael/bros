import { customCatalogFromNames, getModelCatalog } from '../../../utils/ollamaLibrary'
import { ensureDefaultUseGpu, getProvider, listCustomOllamaModels, OLLAMA_SIDECAR_ID } from '../../../utils/providers'

export default defineEventHandler(async (event) => {
  const providerId = String(getQuery(event).providerId || OLLAMA_SIDECAR_ID)
  const { gpu, disk, sections } = await getModelCatalog()
  // GPU present + unset useGpu → persist true once. Explicit false stays false.
  const useGpu = ensureDefaultUseGpu(gpu.available)
  const ollama = getProvider(OLLAMA_SIDECAR_ID)
  // Saved preference from DB (never cleared just because GPU is offline this boot).
  const useGpuPreference = Boolean(ollama?.config?.useGpu)
  const custom = customCatalogFromNames(listCustomOllamaModels(providerId), sections)
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
