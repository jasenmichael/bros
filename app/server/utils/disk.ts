import { statfsSync } from 'node:fs'
import { loadBootstrapConfig } from './config'

export type DiskSpace = {
  path: string
  freeBytes: number
  totalBytes: number
}

/**
 * Free space on the Bros data volume (same host FS as Docker volumes in typical setups).
 */
export function getDiskSpace(path?: string): DiskSpace {
  const target = path || loadBootstrapConfig().dataDir || '/data'
  try {
    const s = statfsSync(target)
    const bsize = Number(s.bsize) || 4096
    return {
      path: target,
      freeBytes: Number(s.bavail) * bsize,
      totalBytes: Number(s.blocks) * bsize,
    }
  } catch {
    return { path: target, freeBytes: Number.POSITIVE_INFINITY, totalBytes: 0 }
  }
}
