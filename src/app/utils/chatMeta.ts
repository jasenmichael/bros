export const STREAM_STATS_MARK = '\x1eBROS_STATS\x1e'

export type ChatMetaStats = {
  durationMs?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
}

export function formatDurationMs(ms: number): string {
  const s = ms / 1000
  if (s < 10) return `${s.toFixed(1)}s`
  return `${Math.round(s)}s`
}

export function formatTokenLabel(promptTokens?: number | null, completionTokens?: number | null): string | null {
  const parts = [promptTokens, completionTokens].filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0)
  if (!parts.length) return null
  return `${parts.reduce((a, b) => a + b, 0)} tok`
}

export function formatContextLabel(contextLength?: number | null): string | null {
  if (typeof contextLength !== 'number' || !Number.isFinite(contextLength) || contextLength <= 0) return null
  if (contextLength >= 1024 && contextLength % 1024 === 0) return `${contextLength / 1024}k ctx`
  return `${contextLength} ctx`
}

export function formatMetaStats(stats: ChatMetaStats): string {
  const duration = typeof stats.durationMs === 'number' && Number.isFinite(stats.durationMs)
    ? formatDurationMs(stats.durationMs)
    : ''
  const tokens = formatTokenLabel(stats.promptTokens, stats.completionTokens) || ''
  return [duration, tokens].filter(Boolean).join(' · ')
}

export function splitStreamBody(raw: string): { text: string; stats: ChatMetaStats | null } {
  const i = raw.indexOf(STREAM_STATS_MARK)
  if (i !== -1) {
    let stats: ChatMetaStats | null = null
    try {
      const parsed = JSON.parse(raw.slice(i + STREAM_STATS_MARK.length)) as ChatMetaStats
      if (parsed && typeof parsed === 'object') stats = parsed
    } catch {
      stats = null
    }
    return { text: raw.slice(0, i), stats }
  }
  const partial = raw.lastIndexOf('\x1e')
  if (partial !== -1 && STREAM_STATS_MARK.startsWith(raw.slice(partial))) {
    return { text: raw.slice(0, partial), stats: null }
  }
  return { text: raw, stats: null }
}
