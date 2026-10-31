import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../app/server/utils/settings', () => ({
  isWhisperEnabled: vi.fn(() => false),
}))

import { isWhisperEnabled } from '../../app/server/utils/settings'
import { isCoreAppEnabled } from '../../app/server/utils/docker-app/coreAppEnabled'

describe('isCoreAppEnabled', () => {
  afterEach(() => {
    vi.mocked(isWhisperEnabled).mockReset()
    vi.mocked(isWhisperEnabled).mockReturnValue(false)
  })

  it('keeps Ollama always on this pass', () => {
    expect(isCoreAppEnabled('ollama')).toBe(true)
  })

  it('gates Whisper on Settings enable_whisper', () => {
    vi.mocked(isWhisperEnabled).mockReturnValue(false)
    expect(isCoreAppEnabled('whisper')).toBe(false)
    vi.mocked(isWhisperEnabled).mockReturnValue(true)
    expect(isCoreAppEnabled('whisper')).toBe(true)
  })

  it('treats unknown ids as enabled', () => {
    expect(isCoreAppEnabled('openwebui')).toBe(true)
  })
})
