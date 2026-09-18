export const DEFAULT_CHAT_TITLE = 'New chat'

export function fallbackTitleFromPrompt(prompt: string): string {
  const line = prompt.trim().split(/\r?\n/, 1)[0]?.replace(/\s+/g, ' ').trim() || ''
  if (!line) return DEFAULT_CHAT_TITLE
  return line.length > 60 ? `${line.slice(0, 57)}…` : line
}

export function sanitizeGeneratedTitle(raw: string, fallback: string): string {
  let t = raw.trim().split(/\r?\n/, 1)[0] || ''
  t = t.replace(/^["'`«»“”‘’]+|["'`«»“”‘’]+$/g, '').trim()
  t = t.replace(/\s+/g, ' ')
  if (!t || t.length > 80) return fallback
  const words = t.split(' ').filter(Boolean)
  if (words.length < 2 || words.length > 5) return fallback
  if (/[^\p{L}\p{N}\s]/u.test(t)) return fallback
  return t
}

export function shouldAutoTitle(title: string, assistantCount: number): boolean {
  return assistantCount === 1 && title === DEFAULT_CHAT_TITLE
}
