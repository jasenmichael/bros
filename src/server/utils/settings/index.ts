import { createError } from 'h3'
import { loadBootstrapConfig, patchBrosYaml } from '../config'

export const ENABLE_HOST_OLLAMA_KEY = 'enable_host_ollama'
export const ENABLE_WHISPER_KEY = 'enable_whisper'

/** Default off. Missing YAML key is off. */
export function isHostOllamaEnabled(): boolean {
  return loadBootstrapConfig().enableHostOllama
}

export function setHostOllamaEnabled(enabled: boolean): boolean {
  patchBrosYaml({ enable_host_ollama: enabled })
  return isHostOllamaEnabled()
}

export function assertHostOllamaVisible(id: string) {
  if (id === 'ollama-host' && !isHostOllamaEnabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found' })
  }
}

/** Default off. Missing YAML key is off. */
export function isWhisperEnabled(): boolean {
  return loadBootstrapConfig().enableWhisper
}

const WHISPER_ID = 'whisper'

/**
 * Off: persist `'0'`, then stop a healthy package (stop errors are logged).
 * On: pull images, start the dockerApp, then persist `'1'`. A failed pull or start leaves the flag off.
 */
export async function setWhisperEnabled(enabled: boolean): Promise<boolean> {
  if (!enabled) {
    patchBrosYaml({ enable_whisper: false })
    try {
      const { getDockerApp } = await import('../docker-app/dockerApps')
      const dockerApp = getDockerApp(WHISPER_ID)
      if (dockerApp && !dockerApp.error) {
        const { stopDockerApp } = await import('../docker')
        await stopDockerApp(WHISPER_ID)
      }
    } catch (err) {
      console.error('whisper stop failed', err)
    }
    return false
  }

  const { pullDockerAppImages, startDockerApp } = await import('../docker')
  await pullDockerAppImages(WHISPER_ID)
  await startDockerApp(WHISPER_ID)
  patchBrosYaml({ enable_whisper: true })
  return true
}
