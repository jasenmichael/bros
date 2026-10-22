import { existsSync, readFileSync } from 'node:fs'
import { join } from 'pathe'

const FILES = ['home/.local/state/opencode/service.json', 'home/.config/opencode/service.json']
const PASSWORD_LINE = /server password (\S+)/g

function passwordFrom(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rec = value as Record<string, unknown>
  if (typeof rec.password === 'string' && rec.password) return rec.password
  for (const child of Object.values(rec)) {
    if (!child || typeof child !== 'object' || Array.isArray(child)) continue
    const nested = (child as Record<string, unknown>).password
    if (typeof nested === 'string' && nested) return nested
  }
  return null
}

/** OpenCode v2 server password, from state then config. */
export function openCodePassword(dataDir: string): string | null {
  for (const rel of FILES) {
    const path = join(dataDir, rel)
    if (!existsSync(path)) continue
    try {
      const found = passwordFrom(JSON.parse(readFileSync(path, 'utf8')))
      if (found) return found
    }
    catch {
      continue
    }
  }
  return null
}

/** Last `server password` line. `opencode serve` prints it and does not write service.json. */
export function passwordFromLogs(text: string): string | null {
  let found: string | null = null
  for (const match of text.matchAll(PASSWORD_LINE)) found = match[1]
  return found
}
