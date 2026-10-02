/** Parse persisted Ollama Chat-off names. Missing or invalid config defaults every model on. */
export function parseDisabledOllamaModels(config: Record<string, unknown> | null | undefined): string[] {
  const raw = config?.disabledModels
  if (!Array.isArray(raw)) return []
  return [...new Set(
    raw
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .map((n) => n.trim()),
  )]
}

export function isOllamaModelChatEnabled(name: string, disabledModels: readonly string[]): boolean {
  return !disabledModels.includes(name)
}

export function filterEnabledOllamaNames(names: readonly string[], disabledModels: readonly string[]): string[] {
  if (!disabledModels.length) return [...names]
  const hide = new Set(disabledModels)
  return names.filter((n) => !hide.has(n))
}

export function nextDisabledOllamaModels(
  disabledModels: readonly string[],
  name: string,
  enabled: boolean,
): string[] {
  const trimmed = name.trim()
  const next = new Set(disabledModels)
  if (enabled) next.delete(trimmed)
  else if (trimmed) next.add(trimmed)
  return [...next]
}
