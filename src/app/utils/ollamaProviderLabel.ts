export const OLLAMA_SIDECAR_LABEL = 'Ollama (core)'
export const OLLAMA_HOST_LABEL = 'Ollama (host)'

export function ollamaProviderDisplayName(
  p: { id: string; name?: string; port?: number | null },
  extras?: { hostOllamaPort?: number | null; hostProbePort?: number | null },
): string {
  if (p.id === 'ollama') return OLLAMA_SIDECAR_LABEL
  if (p.id === 'ollama-host') {
    const port = p.port ?? extras?.hostOllamaPort ?? extras?.hostProbePort
    if (typeof port === 'number' && port > 0) return `Ollama (host port:${port})`
    return OLLAMA_HOST_LABEL
  }
  return p.name || p.id
}
