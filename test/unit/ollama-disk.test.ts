import { describe, expect, it } from 'vitest'
import {
  DISK_MARGIN_BYTES,
  EMPLOYEE_POOL_NAMES,
  MAX_RECOMMENDED_DOWNLOAD_BYTES,
  OLLAMA_CURATED,
  customCatalogFromNames,
  formatSizeBytes,
  isValidOllamaPullName,
  ollamaNameFromMenuValue,
  modelFitsDisk,
  pickRecommended,
  type CatalogModel,
} from '../../src/server/utils/ollamaLibrary'

describe('modelFitsDisk', () => {
  it('allows unknown free space', () => {
    expect(modelFitsDisk(10 * 1024 ** 3, undefined)).toBe(true)
  })

  it('allows unknown or zero model size', () => {
    expect(modelFitsDisk(undefined, 100 * 1024 ** 3)).toBe(true)
    expect(modelFitsDisk(0, 100 * 1024 ** 3)).toBe(true)
  })

  it('rejects when model plus 5GB margin exceeds free bytes', () => {
    const free = 10 * 1024 ** 3
    const tooBig = free - DISK_MARGIN_BYTES + 1
    expect(modelFitsDisk(tooBig, free)).toBe(false)
  })

  it('accepts when model plus margin fits', () => {
    const free = 20 * 1024 ** 3
    const ok = 10 * 1024 ** 3
    expect(modelFitsDisk(ok, free)).toBe(true)
  })
})

describe('formatSizeBytes', () => {
  it('formats known sizes with independent literals', () => {
    expect(formatSizeBytes(500_000_000)).toBe('500 MB')
    expect(formatSizeBytes(5 * 1e9)).toBe('5.0 GB')
    expect(formatSizeBytes(2 * 1e12)).toBe('2.0 TB')
  })

  it('returns undefined for empty sizes', () => {
    expect(formatSizeBytes(undefined)).toBeUndefined()
    expect(formatSizeBytes(0)).toBeUndefined()
  })
})

describe('curated catalog', () => {
  const names = OLLAMA_CURATED.map((m) => m.name)

  it('never lists fake official qwen3-coder:14b', () => {
    expect(names).not.toContain('qwen3-coder:14b')
    expect(names).toContain('freehuntx/qwen3-coder:14b')
  })

  it('includes employee-pool official tags and keeps the 16 GB cap constant', () => {
    expect(MAX_RECOMMENDED_DOWNLOAD_BYTES).toBe(16 * 1024 ** 3)
    for (const name of EMPLOYEE_POOL_NAMES) {
      expect(names).toContain(name)
    }
  })
})

describe('pickRecommended 16 GB cap', () => {
  const disk = { path: '/data', freeBytes: 200 * 1024 ** 3, totalBytes: 500 * 1024 ** 3 }
  const gpu16 = { available: true, name: 'RTX 3080 Laptop GPU', vramMb: 16384 }

  const pool: CatalogModel[] = [
    { name: 'qwen3:30b', label: 'qwen3:30b', source: 'ollama', sizeBytes: 19e9 },
    { name: 'qwen3-coder:30b', label: 'qwen3-coder:30b', source: 'ollama', sizeBytes: 19e9 },
    { name: 'freehuntx/qwen3-coder:14b', label: 'freehuntx/qwen3-coder:14b', source: 'ollama', sizeBytes: 9.3e9 },
    { name: 'qwen2.5-coder:14b', label: 'qwen2.5-coder:14b', source: 'ollama', sizeBytes: 9e9 },
    { name: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b', source: 'ollama', sizeBytes: 4.7e9 },
    { name: 'qwen3:14b', label: 'qwen3:14b', source: 'ollama', sizeBytes: 9.3e9 },
    { name: 'qwen3:8b', label: 'qwen3:8b', source: 'ollama', sizeBytes: 5.2e9 },
    { name: 'gemma3:12b', label: 'gemma3:12b', source: 'ollama', sizeBytes: 8.1e9 },
    { name: 'mistral-small3.1', label: 'mistral-small3.1', source: 'ollama', sizeBytes: 15e9 },
  ]

  it('includes employee-pool tags and drops 30B (~19 GB)', () => {
    const rec = pickRecommended(gpu16, disk, pool, [])
    const names = rec.map((m) => m.name)
    for (const name of EMPLOYEE_POOL_NAMES) {
      expect(names).toContain(name)
    }
    expect(names).not.toContain('qwen3:30b')
    expect(names).not.toContain('qwen3-coder:30b')
    expect(names).not.toContain('qwen3-coder:14b')
  })

  it('never recommends a download over 16 GB', () => {
    const rec = pickRecommended(gpu16, disk, pool, [])
    expect(rec.every((m) => !m.sizeBytes || m.sizeBytes <= MAX_RECOMMENDED_DOWNLOAD_BYTES)).toBe(true)
  })
})

describe('isValidOllamaPullName', () => {
  it('accepts official and community owner/name:tag', () => {
    expect(isValidOllamaPullName('llama3.2')).toBe(true)
    expect(isValidOllamaPullName('qwen2.5-coder:14b')).toBe(true)
    expect(isValidOllamaPullName('freehuntx/qwen3-coder:14b')).toBe(true)
    expect(isValidOllamaPullName('hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M')).toBe(true)
  })

  it('rejects empty or junk', () => {
    expect(isValidOllamaPullName('')).toBe(false)
    expect(isValidOllamaPullName('  ')).toBe(false)
    expect(isValidOllamaPullName('has space/name:tag')).toBe(false)
    expect(isValidOllamaPullName('bad;rm -rf')).toBe(false)
  })

  it('reads a catalog menu value or display label', () => {
    expect(ollamaNameFromMenuValue({ label: 'gemma3:12b · 8.1 GB', value: 'gemma3:12b' })).toBe('gemma3:12b')
    expect(ollamaNameFromMenuValue('gemma3:12b · 8.1 GB')).toBe('gemma3:12b')
    expect(ollamaNameFromMenuValue('freehuntx/qwen3-coder:14b')).toBe('freehuntx/qwen3-coder:14b')
  })
})

describe('customCatalogFromNames', () => {
  const sections = {
    recommended: [{ name: 'llama3.2', label: 'llama3.2', source: 'ollama' as const }],
    ollama: [{ name: 'mistral', label: 'mistral', source: 'ollama' as const }],
    huggingface: [] as CatalogModel[],
  }

  it('keeps community slash names and drops catalog duplicates', () => {
    const custom = customCatalogFromNames(
      ['freehuntx/qwen3-coder:14b', 'llama3.2', 'freehuntx/qwen3-coder:14b', 'not a name'],
      sections,
    )
    expect(custom.map((m) => m.name)).toEqual(['freehuntx/qwen3-coder:14b'])
  })
})
