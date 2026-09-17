export type PinnedNavItem = {
  label: string
  to: string
  icon?: string
  external?: boolean
}

type SidecarNavRow = {
  id: string
  name: string
  packageSlug: string
  interfaces: Array<{ type: string; slug?: string; publish?: number; hostPort?: number }>
  settings: { navPinned: boolean }
}

/**
 * Shared fetch for nav-pinned sidecar web UIs.
 * Refresh after pin toggles: `await refreshPinnedNav()`.
 */
export function usePinnedNav() {
  const route = useRoute()
  const skip = computed(() => route.path === '/login' || route.path === '/setup')

  const { data, refresh, pending, error } = useFetch<{ sidecars: SidecarNavRow[] }>('/api/sidecars', {
    key: 'bros-sidecars-nav',
    lazy: true,
    server: false,
    immediate: false,
    watch: false,
    default: () => ({ sidecars: [] }),
  })

  async function refreshPinnedNav() {
    if (skip.value) return
    await refresh()
  }

  watch(skip, (isSkip) => {
    if (!isSkip) void refreshPinnedNav()
  }, { immediate: true })

  const pinnedItems = computed<PinnedNavItem[]>(() => {
    const rows = data.value?.sidecars || []
    const out: PinnedNavItem[] = []
    for (const s of rows) {
      if (!s.settings?.navPinned) continue
      const webuis = (s.interfaces || []).filter((i) => i.type === 'webui' && (i.publish || i.hostPort))
      for (const iface of webuis) {
        const port = iface.publish || iface.hostPort
        out.push({
          label: s.name,
          to: `http://127.0.0.1:${port}/`,
          icon: 'i-lucide-external-link',
          external: true,
        })
      }
    }
    return out
  })

  return { pinnedItems, refreshPinnedNav, pending, error }
}
