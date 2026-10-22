import type { PackageManager } from './types'

export function debTracksLatest(spec: string): boolean {
  try {
    return new URL(spec).pathname.split('/').includes('latest')
  } catch {
    return false
  }
}

function debUrlError(spec: string): string | null {
  if (!spec || spec.length > 2000 || /\s/.test(spec)) return 'deb spec must be an https URL'
  let url: URL
  try {
    url = new URL(spec)
  } catch {
    return 'deb spec must be an https URL'
  }
  if (url.protocol !== 'https:' || url.username || url.password) return 'deb spec must be an https URL'
  return null
}

export const deb: PackageManager = {
  kind: 'deb',
  args: false,
  specLabel: 'URL',
  placeholder: 'https://example.com/app/latest/app.deb',
  parse(spec, args) {
    if (args) return 'args are only for npm'
    return debUrlError(spec)
  },
  label() {
    return ''
  },
}
