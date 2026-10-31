export type OllamaRestartNotice = {
  recoveredAt: string
  lastRestartReason: 'process-down' | 'probe-fail'
}

export function isOllamaRestartNotice(value: unknown): value is OllamaRestartNotice {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.recoveredAt === 'string'
    && row.recoveredAt.length > 0
    && (row.lastRestartReason === 'process-down' || row.lastRestartReason === 'probe-fail')
}

export function ollamaRestartToast(notice: OllamaRestartNotice) {
  return {
    id: `ollama-restart:${notice.recoveredAt}`,
    title: 'Ollama restarted',
    description: notice.lastRestartReason === 'process-down'
      ? 'Ollama crashed. Bros restarted it.'
      : 'Ollama became unresponsive. Bros restarted it.',
    color: 'warning' as const,
    icon: 'i-lucide-refresh-cw',
  }
}

export function shouldToastOllamaRestart(
  notice: unknown,
  seenRecoveredAt: string | null,
): notice is OllamaRestartNotice {
  return isOllamaRestartNotice(notice) && notice.recoveredAt !== seenRecoveredAt
}
