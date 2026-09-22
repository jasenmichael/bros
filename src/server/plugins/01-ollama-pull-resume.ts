import { resumeInterruptedPulls } from '../utils/ollamaPullJobs'

/** Resume SQLite pull jobs after Bros / container restart. */
export default defineNitroPlugin(() => {
  try {
    resumeInterruptedPulls()
  }
  catch (err) {
    console.error('[bros] ollama pull resume failed', err)
  }
})
