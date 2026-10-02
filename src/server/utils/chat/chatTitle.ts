export const DEFAULT_CHAT_TITLE = 'New chat'
export const DEFAULT_AGENT_TITLE = 'New agent'

/** Sidecar `bros` Label: skill. Tag must match the specialist training data. */
export function labelRequestContent(userPrompt: string): string {
  return `Label: ${userPrompt}`
}

export function fallbackTitleFromPrompt(prompt: string, emptyTitle = DEFAULT_CHAT_TITLE): string {
  const line = prompt.trim().split(/\r?\n/, 1)[0]?.replace(/\s+/g, ' ').trim() || ''
  if (!line) return emptyTitle
  return line.length > 60 ? `${line.slice(0, 57)}…` : line
}

export function sanitizeGeneratedTitle(raw: string, fallback: string): string {
  let t = raw.trim().split(/\r?\n/, 1)[0] || ''
  t = t.replace(/^["'`«»“”‘’]+|["'`«»“”‘’]+$/g, '').trim()
  t = t.replace(/[,:;!?]+/g, '')
  t = t.replace(/\s+/g, ' ').trim()
  t = t.replace(/\u2019/g, "'")
  if (!t || t.length > 80) return fallback
  // Tiny specialist often echoes its SYSTEM line ("Bros Model Label") instead of a title.
  if (/^bros model(?:\s+label)?$/i.test(t) || /^label$/i.test(t)) return fallback
  const words = t.split(' ').filter(Boolean)
  if (words.length < 2 || words.length > 5) return fallback
  // Allow apostrophes so "I Can't Sleep" is kept; reject other leftover punctuation.
  if (/[^\p{L}\p{N}\s']/u.test(t)) return fallback
  return t
}

export function shouldAutoTitle(title: string, assistantCount: number): boolean {
  return assistantCount === 1 && (title === DEFAULT_CHAT_TITLE || title === DEFAULT_AGENT_TITLE)
}
