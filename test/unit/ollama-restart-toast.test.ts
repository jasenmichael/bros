import { describe, expect, it } from 'vitest'
import {
  isOllamaRestartNotice,
  ollamaRestartToast,
  shouldToastOllamaRestart,
} from '../../src/app/utils/ollamaRestartToast'

describe('ollama restart notice toast', () => {
  const notice = {
    recoveredAt: '2026-09-22T01:00:00.000Z',
    lastRestartReason: 'process-down' as const,
  }

  it('accepts the server recovery notice shape', () => {
    expect(isOllamaRestartNotice(notice)).toBe(true)
    expect(isOllamaRestartNotice({ recoveredAt: '', lastRestartReason: 'process-down' })).toBe(false)
    expect(isOllamaRestartNotice({ recoveredAt: notice.recoveredAt, lastRestartReason: 'boom' })).toBe(false)
  })

  it('builds one Nuxt UI toast per recoveredAt', () => {
    expect(ollamaRestartToast(notice)).toEqual({
      id: 'ollama-restart:2026-09-22T01:00:00.000Z',
      title: 'Ollama restarted',
      description: 'Ollama crashed. Bros restarted it.',
      color: 'warning',
      icon: 'i-lucide-refresh-cw',
    })
    expect(ollamaRestartToast({
      recoveredAt: notice.recoveredAt,
      lastRestartReason: 'probe-fail',
    }).description).toBe('Ollama became unresponsive. Bros restarted it.')
  })

  it('toasts once per recovery id', () => {
    expect(shouldToastOllamaRestart(notice, null)).toBe(true)
    expect(shouldToastOllamaRestart(notice, notice.recoveredAt)).toBe(false)
  })
})
