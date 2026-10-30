import { runOllamaHealthCheck } from '../utils/docker-app/ollamaMustRun'

const INTERVAL_MS = 15_000
const FIRST_TICK_MS = 5_000

/** Keep dockerApp Ollama up. Restart only when the process is down or version probe fails. */
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  const tick = () => {
    runOllamaHealthCheck().catch((err) => {
      const text = err instanceof Error ? err.message : String(err)
      console.error('[bros] ollama health', text.split('\n')[0])
    })
  }
  setTimeout(tick, FIRST_TICK_MS).unref()
  setInterval(tick, INTERVAL_MS).unref()
})
