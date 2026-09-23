export type AgentRecent = {
  id: string
  title: string
  modelId: string
  updatedAt: number
}

/**
 * Shared fetch for dock Previous agents.
 * Refresh after send / rename / delete: `await refreshAgentRecents()`.
 */
export function useAgentRecents() {
  const route = useRoute()
  const skip = computed(() => route.path === '/login' || route.path === '/setup')

  const { data, refresh, pending, error } = useFetch<{ conversations: AgentRecent[] }>('/api/agent', {
    key: 'bros-agent-recents',
    lazy: true,
    server: false,
    immediate: false,
    watch: false,
    default: () => ({ conversations: [] }),
  })

  async function refreshAgentRecents() {
    if (skip.value) return
    await refresh()
  }

  watch(skip, (isSkip) => {
    if (import.meta.client && !isSkip) void refreshAgentRecents()
  }, { immediate: true })

  const conversations = computed(() => data.value?.conversations || [])

  return { conversations, refreshAgentRecents, pending, error }
}
