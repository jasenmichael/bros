const PROGRESS_ID = 'desktop-ensure'

type EnsureStatus = { running?: boolean; current?: string; version?: string; failures?: string[] }

export function ensureToastTitle(status: EnsureStatus) {
  const current = status.current || 'package'
  if (current === 'node' && status.version) return `Installing node… ${status.version}`
  return `Installing ${current}…`
}

export default defineNuxtPlugin(() => {
  const toast = useToast()
  const seen = new Set<string>()
  let progress = false
  const { data, refresh } = useFetch<EnsureStatus>('/api/apps/ensure', {
    key: 'bros-desktop-ensure',
    lazy: true,
    server: false,
  })
  const timer = setInterval(() => { void refresh() }, 2000)
  onScopeDispose(() => clearInterval(timer))

  watch(
    () => data.value,
    (status) => {
      if (!status) return
      const failures = status.failures || []
      if (!failures.length) seen.clear()
      for (const id of failures) {
        if (seen.has(id)) continue
        seen.add(id)
        toast.add({ title: `${id} failed to install`, color: 'error' })
      }
      if (status.running && status.current) {
        const title = ensureToastTitle(status)
        const description = status.version && status.current !== 'node' ? `Node ${status.version}` : undefined
        if (!progress) {
          toast.add({ id: PROGRESS_ID, title, description, duration: 0 })
          progress = true
        } else {
          toast.update(PROGRESS_ID, { title, description })
        }
        return
      }
      if (progress) {
        toast.remove(PROGRESS_ID)
        progress = false
      }
    },
    { immediate: true },
  )
})
