import { sidecarWebUiLinks } from '../utils/sidecars/sidecarHostLinks'

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
  disabled?: boolean
  interfaces: Array<{
    type: string
    slug?: string
    publish?: number
    hostPort?: number
    proxy?: { public?: boolean }
  }>
  settings: { navPinned: boolean }
  status?: { running: boolean }
}

/**
 * Dock links for pinned web UIs.
 * A stored pin stays; the dock skips a sidecar that is disabled or not running.
 */
type PackageNavRow = {
  id: string
  name?: string
  enabled?: boolean
  forwardHost?: boolean
  navPinned?: boolean
  serviceRunning?: boolean
  services?: unknown[]
  interfaces?: Array<{ type: string; containerPort?: number; publish?: number }>
}

export function packageNavItems(rows: PackageNavRow[], desktopRunning: boolean, viaTunnel = false): PinnedNavItem[] {
  if (!desktopRunning) return []
  const out: PinnedNavItem[] = []
  for (const pkg of rows) {
    if (!pkg.navPinned || pkg.enabled === false || pkg.forwardHost === false) continue
    if (pkg.services?.length && !pkg.serviceRunning) continue
    const face = (pkg.interfaces || []).find((row) => row.type === 'webui' && row.containerPort && row.publish)
    if (!face?.publish) continue
    out.push({
      label: pkg.name || pkg.id,
      to: viaTunnel ? `/${pkg.id}/` : `http://127.0.0.1:${face.publish}/`,
      icon: 'i-lucide-external-link',
      external: !viaTunnel,
    })
  }
  return out
}

export function pinnedNavItems(rows: SidecarNavRow[], viaTunnel = false): PinnedNavItem[] {
  const out: PinnedNavItem[] = []
  for (const s of rows) {
    if (!s.settings?.navPinned) continue
    if (s.disabled || !s.status?.running) continue
    for (const link of sidecarWebUiLinks(s, { viaTunnel })) {
      out.push({
        label: link.label,
        to: link.to,
        icon: 'i-lucide-external-link',
        external: true,
      })
    }
  }
  return out
}

/**
 * Shared fetch for nav-pinned sidecar web UIs.
 * Refresh after pin toggles and after start/stop: `await refreshPinnedNav()`.
 */
export function usePinnedNav() {
  const route = useRoute()
  const skip = computed(() => route.path === '/login' || route.path === '/setup')

  const { data, refresh, pending, error } = useFetch<{ sidecars: SidecarNavRow[]; viaTunnel?: boolean }>('/api/sidecars', {
    key: 'bros-sidecars-nav',
    lazy: true,
    server: false,
    immediate: false,
    watch: false,
    default: () => ({ sidecars: [] }),
  })
  const apps = useFetch<{ packages: PackageNavRow[] }>('/api/cli/packages', {
    key: 'bros-package-nav',
    lazy: true,
    server: false,
    immediate: false,
    watch: false,
    default: () => ({ packages: [] }),
  })

  async function refreshPinnedNav() {
    if (skip.value) return
    await Promise.all([refresh(), apps.refresh()])
  }

  watch(skip, (isSkip) => {
    if (!isSkip) void refreshPinnedNav()
  }, { immediate: true })

  const pinnedItems = computed(() => {
    const viaTunnel = Boolean(data.value?.viaTunnel)
    const desktop = (data.value?.sidecars || []).find((row) => row.id === 'desktop')
    return [
      ...pinnedNavItems(data.value?.sidecars || [], viaTunnel),
      ...packageNavItems(apps.data.value?.packages || [], Boolean(desktop?.status?.running), viaTunnel),
    ]
  })

  return { pinnedItems, refreshPinnedNav, pending, error }
}
