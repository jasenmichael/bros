export type ChatRecent = {
  id: string
  title: string
  modelId: string
  updatedAt: number
}

/**
 * Shared fetch for dock Previous chats.
 * Refresh after send / rename / delete: `await refreshChatRecents()`.
 */
export function useChatRecents() {
  const route = useRoute()
  const skip = computed(() => route.path === '/login' || route.path === '/setup')

  const { data, refresh, pending, error } = useFetch<{ conversations: ChatRecent[] }>('/api/chat', {
    key: 'bros-chat-recents',
    lazy: true,
    server: false,
    immediate: false,
    watch: false,
    default: () => ({ conversations: [] }),
  })

  async function refreshChatRecents() {
    if (skip.value) return
    await refresh()
  }

  watch(skip, (isSkip) => {
    if (import.meta.client && !isSkip) void refreshChatRecents()
  }, { immediate: true })

  const conversations = computed(() => data.value?.conversations || [])

  return { conversations, refreshChatRecents, pending, error }
}
