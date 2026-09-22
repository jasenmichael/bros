import { ollamaRestartToast, shouldToastOllamaRestart } from '../utils/ollamaRestartToast'

/** Watch status for a sidecar Ollama recovery and toast once per recoveredAt. */
export default defineNuxtPlugin(() => {
  const toast = useToast()
  const seen = ref<string | null>(null)
  const { data } = useFetch<{ ollamaRestartNotice?: unknown }>(
    '/api/status',
    {
      key: 'bros-ollama-restart-notice',
      lazy: true,
      refreshInterval: 8000,
    },
  )

  watch(
    () => data.value?.ollamaRestartNotice,
    (notice) => {
      if (!shouldToastOllamaRestart(notice, seen.value)) return
      seen.value = notice.recoveredAt
      toast.add(ollamaRestartToast(notice))
    },
    { immediate: true },
  )
})
