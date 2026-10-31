import { CORE_DOCKER_APP_ID, WHISPER_DOCKER_APP_ID } from './dockerApps'
import { isWhisperEnabled } from '../settings'

/**
 * Core docker apps are enabled by default.
 * Today only Whisper can be disabled (Settings). Ollama stays on;
 * a future Settings flag can gate CORE_DOCKER_APP_ID the same way.
 */
export function isCoreAppEnabled(id: string): boolean {
  if (id === WHISPER_DOCKER_APP_ID) return isWhisperEnabled()
  if (id === CORE_DOCKER_APP_ID) {
    // Future: return isOllamaEnabled() when Settings gains that switch.
    return true
  }
  return true
}
