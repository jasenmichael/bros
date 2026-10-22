import { readFileSync } from 'node:fs'
import { formatSizeBytes } from './providers/ollamaLibrary'

export type HostMemory = {
  availableBytes: number
  totalBytes: number
  availableLabel: string
  totalLabel: string
}

function labelBytes(n: number): string {
  return formatSizeBytes(n) ?? '0 B'
}

/** Parse Linux `/proc/meminfo`. `MemAvailable` wins; otherwise `MemFree`. */
export function parseMeminfo(text: string): { availableBytes: number; totalBytes: number } | null {
  const total = text.match(/^MemTotal:\s+(\d+)\s+kB/m)
  if (!total) return null
  const available = text.match(/^MemAvailable:\s+(\d+)\s+kB/m)
  const free = text.match(/^MemFree:\s+(\d+)\s+kB/m)
  const availKb = available?.[1] ?? free?.[1]
  if (!availKb) return null
  return {
    totalBytes: Number(total[1]) * 1024,
    availableBytes: Number(availKb) * 1024,
  }
}

export function readHostMemory(meminfoPath = '/proc/meminfo'): HostMemory | null {
  try {
    const parsed = parseMeminfo(readFileSync(meminfoPath, 'utf8'))
    if (!parsed) return null
    return {
      ...parsed,
      availableLabel: labelBytes(parsed.availableBytes),
      totalLabel: labelBytes(parsed.totalBytes),
    }
  }
  catch {
    return null
  }
}
