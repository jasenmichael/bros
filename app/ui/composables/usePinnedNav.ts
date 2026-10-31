import { dockerAppWebUiLinks } from '../utils/docker-app/dockerAppHostLinks'

export type PinnedNavItem = {
  label: string
  to: string
  icon?: string
  external?: boolean
}

type DockerAppNavRow = {
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
 * A stored pin stays; the dock skips a dockerApp that is disabled or not running.
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

export function packageNavItems(rows: PackageNavRow[], viaTunnel = false): PinnedNavItem[] {
  const out: PinnedNavItem[] = []
  for (const pkg of rows) {
    if (!pkg.navPinned || pkg.enabled === false || pkg.forwardHost === false) continue
    if (pkg.services?.length && !pkg.serviceRunning) continue
    const face = (pkg.interfaces || []).find((row) => row.type === 'webui' && row.publish)
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

export function pinnedNavItems(rows: DockerAppNavRow[], viaTunnel = false): PinnedNavItem[] {
  const out: PinnedNavItem[] = []
  for (const s of rows) {
    if (!s.settings?.navPinned) continue
    if (s.disabled || !s.status?.running) continue
    for (const link of dockerAppWebUiLinks(s, { viaTunnel })) {
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
 * Shared fetch for nav-pinned dockerApp web UIs.
 * Refresh after pin toggles and after start/stop: `await refreshPinnedNav()`.
 */
export function usePinnedNav() {
  const route = useRoute()
  const skip = computed(() => route.path === '/login' || route.path === '/setup')

  const { data, refresh, pending, error } = useFetch<{ docker: DockerAppNavRow[]; viaTunnel?: boolean }>('/api/apps', {
    key: 'bros-apps-nav',
    lazy: true,
    server: false,
    immediate: false,
    watch: false,
    default: () => ({ docker: [] }),
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
    return [
      ...pinnedNavItems(data.value?.docker || [], viaTunnel),
      ...packageNavItems(apps.data.value?.packages || [], viaTunnel),
    ]
  })

  return { pinnedItems, refreshPinnedNav, pending, error }
}
