import { isValidOllamaPullName, ollamaNameFromMenuValue } from '../../app/utils/ollamaPullName'
import { detectGpu, type GpuInfo } from './gpu'
import { getDiskSpace, type DiskSpace } from './disk'

export { isValidOllamaPullName, ollamaNameFromMenuValue }

export type CatalogModel = {
  /** Exact string passed to `ollama pull` */
  name: string
  label: string
  source: 'ollama' | 'huggingface'
  /** Approximate on-disk size in bytes (Q4-ish when estimated). */
  sizeBytes?: number
}

export type CatalogSections = {
  recommended: CatalogModel[]
  ollama: CatalogModel[]
  huggingface: CatalogModel[]
  custom: CatalogModel[]
}

/** ~0.55 bytes/param for typical Q4 GGUF / Ollama default quant. */
function fromParamsB(billion: number): number {
  return Math.round(billion * 1e9 * 0.55)
}

/** Recommended download cap (16 GB laptop). 30B Qwen3 tags are ~19 GB. */
export const MAX_RECOMMENDED_DOWNLOAD_BYTES = 16 * 1024 ** 3

/** Everyday employee-pool tags that fit the 16 GB download cap. */
export const EMPLOYEE_POOL_NAMES = [
  'freehuntx/qwen3-coder:14b',
  'qwen2.5-coder:14b',
  'qwen2.5-coder:7b',
  'qwen3:14b',
  'qwen3:8b',
  'gemma3:12b',
  'mistral-small3.1',
] as const

export const OLLAMA_CURATED: CatalogModel[] = [
  { name: 'llama3.2:1b', label: 'llama3.2:1b', source: 'ollama', sizeBytes: fromParamsB(1) },
  { name: 'llama3.2:3b', label: 'llama3.2:3b', source: 'ollama', sizeBytes: fromParamsB(3) },
  { name: 'llama3.2', label: 'llama3.2', source: 'ollama', sizeBytes: fromParamsB(3) },
  { name: 'llama3.1:8b', label: 'llama3.1:8b', source: 'ollama', sizeBytes: fromParamsB(8) },
  { name: 'llama3.1', label: 'llama3.1', source: 'ollama', sizeBytes: fromParamsB(8) },
  { name: 'mistral', label: 'mistral', source: 'ollama', sizeBytes: fromParamsB(7) },
  { name: 'mistral-small3.1', label: 'mistral-small3.1', source: 'ollama', sizeBytes: 15 * 1e9 },
  { name: 'phi3', label: 'phi3', source: 'ollama', sizeBytes: fromParamsB(3.8) },
  { name: 'phi4', label: 'phi4', source: 'ollama', sizeBytes: fromParamsB(14) },
  { name: 'gemma2', label: 'gemma2', source: 'ollama', sizeBytes: fromParamsB(9) },
  { name: 'gemma3', label: 'gemma3', source: 'ollama', sizeBytes: fromParamsB(4) },
  { name: 'gemma3:12b', label: 'gemma3:12b', source: 'ollama', sizeBytes: 8.1 * 1e9 },
  { name: 'qwen2.5:3b', label: 'qwen2.5:3b', source: 'ollama', sizeBytes: fromParamsB(3) },
  { name: 'qwen2.5:7b', label: 'qwen2.5:7b', source: 'ollama', sizeBytes: fromParamsB(7) },
  { name: 'qwen2.5', label: 'qwen2.5', source: 'ollama', sizeBytes: fromParamsB(7) },
  { name: 'qwen2.5-coder', label: 'qwen2.5-coder', source: 'ollama', sizeBytes: fromParamsB(7) },
  { name: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b', source: 'ollama', sizeBytes: 4.7 * 1e9 },
  { name: 'qwen2.5-coder:14b', label: 'qwen2.5-coder:14b', source: 'ollama', sizeBytes: 9 * 1e9 },
  { name: 'qwen3:8b', label: 'qwen3:8b', source: 'ollama', sizeBytes: 5.2 * 1e9 },
  { name: 'qwen3:14b', label: 'qwen3:14b', source: 'ollama', sizeBytes: 9.3 * 1e9 },
  { name: 'qwen3:30b', label: 'qwen3:30b', source: 'ollama', sizeBytes: 19 * 1e9 },
  { name: 'qwen3-coder:30b', label: 'qwen3-coder:30b', source: 'ollama', sizeBytes: 19 * 1e9 },
  { name: 'freehuntx/qwen3-coder:14b', label: 'freehuntx/qwen3-coder:14b', source: 'ollama', sizeBytes: 9.3 * 1e9 },
  { name: 'deepseek-r1', label: 'deepseek-r1', source: 'ollama', sizeBytes: fromParamsB(8) },
  { name: 'codellama', label: 'codellama', source: 'ollama', sizeBytes: fromParamsB(7) },
  { name: 'llava', label: 'llava', source: 'ollama', sizeBytes: fromParamsB(7) },
  { name: 'moondream', label: 'moondream', source: 'ollama', sizeBytes: fromParamsB(1.8) },
  { name: 'nomic-embed-text', label: 'nomic-embed-text', source: 'ollama', sizeBytes: 275 * 1e6 },
  { name: 'mxbai-embed-large', label: 'mxbai-embed-large', source: 'ollama', sizeBytes: 670 * 1e6 },
  { name: 'tinyllama', label: 'tinyllama', source: 'ollama', sizeBytes: fromParamsB(1.1) },
  { name: 'orca-mini', label: 'orca-mini', source: 'ollama', sizeBytes: fromParamsB(3) },
]

const HF_CURATED: CatalogModel[] = [
  {
    name: 'hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M',
    label: 'Llama-3.2-3B-Instruct Q4_K_M',
    source: 'huggingface',
    sizeBytes: fromParamsB(3),
  },
  {
    name: 'hf.co/bartowski/Llama-3.1-8B-Instruct-GGUF:Q4_K_M',
    label: 'Llama-3.1-8B-Instruct Q4_K_M',
    source: 'huggingface',
    sizeBytes: fromParamsB(8),
  },
  {
    name: 'hf.co/bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M',
    label: 'Qwen2.5-7B-Instruct Q4_K_M',
    source: 'huggingface',
    sizeBytes: fromParamsB(7),
  },
  {
    name: 'hf.co/bartowski/Phi-3.5-mini-instruct-GGUF:Q4_K_M',
    label: 'Phi-3.5-mini Q4_K_M',
    source: 'huggingface',
    sizeBytes: fromParamsB(3.8),
  },
  {
    name: 'hf.co/MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF:Q4_K_M',
    label: 'Mistral-7B-Instruct Q4_K_M',
    source: 'huggingface',
    sizeBytes: fromParamsB(7),
  },
]

export function customCatalogFromNames(names: string[], sections: Omit<CatalogSections, 'custom'>): CatalogModel[] {
  const known = new Set(
    [...sections.recommended, ...sections.ollama, ...sections.huggingface].map((m) => m.name),
  )
  const seen = new Set<string>()
  const out: CatalogModel[] = []
  for (const raw of names) {
    const name = raw.trim()
    if (!isValidOllamaPullName(name) || known.has(name) || seen.has(name)) continue
    seen.add(name)
    out.push({ name, label: name, source: name.startsWith('hf.co/') ? 'huggingface' : 'ollama' })
  }
  return out
}

export function formatSizeBytes(n?: number): string | undefined {
  if (!n || n <= 0) return undefined
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`
  return `${n} B`
}

/** Keep 5 GB headroom for layers / temp. */
export const DISK_MARGIN_BYTES = 5 * 1024 ** 3

export function modelFitsDisk(sizeBytes: number | undefined, freeBytes: number | undefined): boolean {
  if (freeBytes == null) return true
  if (sizeBytes == null || sizeBytes <= 0) return true
  return sizeBytes + DISK_MARGIN_BYTES <= freeBytes
}

let cache: { at: number; sections: CatalogSections; gpu: GpuInfo; disk: DiskSpace } | null = null
const TTL_MS = 30 * 60 * 1000

async function fetchOllamaLibrary(): Promise<CatalogModel[]> {
  try {
    const res = await fetch('https://ollama.com/api/tags', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return []
    const data = await res.json() as { models?: Array<{ name: string; size?: number }> }
    return (data.models || [])
      .filter((m) => m.name?.trim())
      .map((m) => ({
        name: m.name,
        label: m.name,
        source: 'ollama' as const,
        sizeBytes: m.size && m.size > 0 ? m.size : undefined,
      }))
  } catch {
    return []
  }
}

async function fetchHuggingFaceGguf(): Promise<CatalogModel[]> {
  try {
    const url = 'https://huggingface.co/api/models?filter=gguf&sort=downloads&direction=-1&limit=24'
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const data = await res.json() as Array<{ id: string; safetensors?: { total?: number } }>
    return (data || [])
      .filter((m) => m.id && /gguf/i.test(m.id))
      .slice(0, 20)
      .map((m) => {
        // Prefer Q4_K_M-ish estimate from name param count when present
        const paramMatch = m.id.match(/(\d+(?:\.\d+)?)[Bb](?:-|_|$)/)
        const sizeBytes = paramMatch ? fromParamsB(Number.parseFloat(paramMatch[1]!)) : undefined
        return {
          name: `hf.co/${m.id}`,
          label: m.id,
          source: 'huggingface' as const,
          sizeBytes,
        }
      })
  } catch {
    return []
  }
}

function mergeByName(lists: CatalogModel[][]): CatalogModel[] {
  const map = new Map<string, CatalogModel>()
  for (const list of lists) {
    for (const m of list) {
      const prev = map.get(m.name)
      if (!prev) {
        map.set(m.name, m)
        continue
      }
      // Prefer entry with known sizeBytes
      if (!prev.sizeBytes && m.sizeBytes) map.set(m.name, { ...prev, ...m, sizeBytes: m.sizeBytes })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
}

export function pickRecommended(
  gpu: GpuInfo,
  disk: DiskSpace,
  ollama: CatalogModel[],
  hf: CatalogModel[],
): CatalogModel[] {
  const vram = gpu.available ? (gpu.vramMb || 0) : 0
  const free = disk.freeBytes
  const pool = [...ollama, ...hf].filter((m) => modelFitsDisk(m.sizeBytes, free))

  // Cap recommended disk footprint (never suggest >16 GB downloads).
  const maxDisk = gpu.available
    ? Math.min(
      free - DISK_MARGIN_BYTES,
      MAX_RECOMMENDED_DOWNLOAD_BYTES,
      Math.max(8 * 1024 ** 3, (vram || 8192) * 1024 * 1024 * 2.5),
    )
    : Math.min(free - DISK_MARGIN_BYTES, 6 * 1024 ** 3)
  const capped = pool.filter((m) => !m.sizeBytes || m.sizeBytes <= maxDisk)

  const want = (pred: (m: CatalogModel) => boolean, limit: number) =>
    capped.filter(pred).slice(0, limit)

  if (!gpu.available || vram < 4000) {
    const names = new Set([
      'tinyllama', 'llama3.2:1b', 'llama3.2:3b', 'phi3', 'qwen2.5:3b', 'orca-mini',
      'hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M',
      'hf.co/bartowski/Phi-3.5-mini-instruct-GGUF:Q4_K_M',
    ])
    return mergeByName([
      want((m) => names.has(m.name), 8),
      want((m) => /1b|3b|mini|tiny|phi3/i.test(m.name), 4),
    ]).slice(0, 8)
  }

  if (vram < 10000) {
    const names = new Set([
      'llama3.2', 'llama3.1:8b', 'mistral', 'qwen2.5:7b', 'qwen3:8b', 'phi4', 'gemma2',
      'qwen2.5-coder:7b',
      'hf.co/bartowski/Llama-3.1-8B-Instruct-GGUF:Q4_K_M',
      'hf.co/bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M',
      'hf.co/MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF:Q4_K_M',
    ])
    return mergeByName([
      want((m) => names.has(m.name), 10),
      want((m) => /7b|8b|9b/i.test(m.name) && !/70b|72b|397b/i.test(m.name), 4),
    ]).slice(0, 10)
  }

  const names = new Set<string>(EMPLOYEE_POOL_NAMES)
  return mergeByName([
    want((m) => names.has(m.name), 12),
    want((m) => /14b|12b|8b|coder|small3/i.test(m.name) && !/30b|32b|70b|405b|675b|480b/i.test(m.name), 6),
  ]).slice(0, 12)
}

export async function getModelCatalog(force = false): Promise<{
  gpu: GpuInfo
  disk: DiskSpace
  sections: CatalogSections
}> {
  const disk = getDiskSpace()
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    // Refresh disk each call (free space changes); keep catalog lists cached
    return { gpu: cache.gpu, disk, sections: cache.sections }
  }

  const gpu = await detectGpu()
  const [featured, hfRemote] = await Promise.all([
    fetchOllamaLibrary(),
    fetchHuggingFaceGguf(),
  ])

  const ollama = mergeByName([OLLAMA_CURATED, featured])
  const huggingface = mergeByName([HF_CURATED, hfRemote])
  const recommended = pickRecommended(gpu, disk, ollama, huggingface)

  const sections: CatalogSections = { recommended, ollama, huggingface, custom: [] }
  cache = { at: Date.now(), sections, gpu, disk }
  return { gpu, disk, sections }
}

export function findCatalogModel(name: string, extra?: CatalogSections): CatalogModel | undefined {
  const sections = extra || cache?.sections
  if (!sections) return undefined
  const all = [
    ...sections.recommended,
    ...sections.ollama,
    ...sections.huggingface,
    ...(sections.custom || []),
  ]
  return all.find((m) => m.name === name)
}

