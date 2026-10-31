import { ollamaRestartToast, shouldToastOllamaRestart } from '../utils/ollamaRestartToast'

const SEEN_KEY = 'bros-ollama-restart-seen'

function readSeen(): string | null {
  try { return sessionStorage.getItem(SEEN_KEY) } catch { return null }
}

/** Watch status for a dockerApp Ollama recovery and toast once per recoveredAt. */
export default defineNuxtPlugin(() => {
  const toast = useToast()
  const seen = ref<string | null>(readSeen())
  const { data, refresh } = useFetch<{ ollamaRestartNotice?: unknown }>(
    '/api/status',
    {
      key: 'bros-ollama-restart-notice',
      lazy: true,
    },
  )
  const timer = setInterval(() => { void refresh() }, 8000)
  onScopeDispose(() => clearInterval(timer))

  watch(
    () => data.value?.ollamaRestartNotice,
    (notice) => {
      if (!shouldToastOllamaRestart(notice, seen.value)) return
      seen.value = notice.recoveredAt
      try { sessionStorage.setItem(SEEN_KEY, notice.recoveredAt) } catch { /* private mode */ }
      toast.add(ollamaRestartToast(notice))
    },
    { immediate: true },
  )
})
