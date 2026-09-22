import { runOllamaHealthCheck } from '../utils/ollamaMustRun'

const INTERVAL_MS = 15_000
const FIRST_TICK_MS = 5_000

/** Keep sidecar Ollama up. Restart only when the process is down or version probe fails. */
export default defineNitroPlugin(() => {
  const tick = () => {
    runOllamaHealthCheck().catch((err) => {
      console.error('[bros] ollama health', err)
    })
  }
  setTimeout(tick, FIRST_TICK_MS)
  setInterval(tick, INTERVAL_MS)
})
