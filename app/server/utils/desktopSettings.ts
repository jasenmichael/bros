import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'pathe'
import { loadBootstrapConfig } from './config'
import { claimForHost } from './hostClaim'
import { execInBros } from './docker'

export type DesktopSettings = {
  color: string
  imageUrl: string
}

const DEFAULT: DesktopSettings = {
  color: '#141a22',
  imageUrl: '',
}

function settingsPath() {
  const { dataDir } = loadBootstrapConfig()
  return join(dataDir, 'config', 'desktop.json')
}

function parseColor(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT.color
  const v = raw.trim()
  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) return DEFAULT.color
  return v.toLowerCase()
}

function parseUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const v = raw.trim()
  if (!v) return ''
  if (!/^https?:\/\//i.test(v)) return ''
  return v
}

export function readDesktopSettings(): DesktopSettings {
  const path = settingsPath()
  if (!existsSync(path)) return { ...DEFAULT }
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    return {
      color: parseColor(data.color),
      imageUrl: parseUrl(data.imageUrl),
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function writeDesktopSettings(patch: Partial<DesktopSettings>): DesktopSettings {
  const cur = readDesktopSettings()
  const next: DesktopSettings = {
    color: patch.color !== undefined ? parseColor(patch.color) : cur.color,
    imageUrl: patch.imageUrl !== undefined ? parseUrl(patch.imageUrl) : cur.imageUrl,
  }
  const path = settingsPath()
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`)
  claimForHost(path)
  return next
}

/** Best-effort apply inside the desktop container. */
export async function applyDesktopWallpaper(settings = readDesktopSettings()) {
  try {
    await execInBros([
      '/usr/local/bin/bros-wallpaper.sh',
      settings.color,
      settings.imageUrl || '',
    ])
  } catch {
    // Desktop may be down; settings still saved for next session.
  }
}
