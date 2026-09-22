/** Official `name[:tag]`, community `owner/name[:tag]`, or HF `hf.co/owner/repo[:quant]`. */
export function isValidOllamaPullName(raw: string): boolean {
  const name = raw.trim()
  if (!name || name.length > 256 || /\s/.test(name)) return false
  if (/[;|&$`<>\\]/.test(name)) return false
  return /^(?:hf\.co\/)?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*(?::[A-Za-z0-9._-]+)?$/.test(name)
}

/** Menu v-model may be `{ label, value }` or a display label like `gemma3:12b · 8.1 GB`. */
export function ollamaNameFromMenuValue(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return ''
    if (isValidOllamaPullName(trimmed)) return trimmed
    const head = trimmed.split(/\s+·\s+/)[0]?.trim() || ''
    return isValidOllamaPullName(head) ? head : trimmed
  }
  if (typeof raw === 'object') {
    const o = raw as { value?: unknown; label?: unknown }
    const fromValue = ollamaNameFromMenuValue(o.value)
    if (fromValue) return fromValue
    return ollamaNameFromMenuValue(o.label)
  }
  return ''
}
