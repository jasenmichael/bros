export type NavDockPersist = {
  open: boolean
  width: number
  iconMode: boolean
}

const STORAGE_KEY = 'bros-nav-dock'
const DESKTOP_MQ = '(min-width: 1024px)'

export const ICON_WIDTH = 56
export const SNAP_TO_ICON = 80
export const SNAP_TO_LABELS = 112
export const MIN_WIDTH = 160
export const MAX_WIDTH = 420

export const NAV_DOCK_DEFAULTS: NavDockPersist = {
  open: true,
  width: 256,
  iconMode: false,
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function clampLiveWidth(n: number) {
  return clamp(n, ICON_WIDTH, MAX_WIDTH)
}

export function iconModeForWidth(liveWidth: number, wasIcon: boolean) {
  return wasIcon ? liveWidth < SNAP_TO_LABELS : liveWidth < SNAP_TO_ICON
}

export function labeledWidthFromLive(liveWidth: number) {
  return clamp(liveWidth, MIN_WIDTH, MAX_WIDTH)
}

export function readNavDockPersist(): NavDockPersist {
  if (typeof localStorage === 'undefined') return { ...NAV_DOCK_DEFAULTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...NAV_DOCK_DEFAULTS }
    const p = JSON.parse(raw) as Partial<NavDockPersist>
    return {
      open: typeof p.open === 'boolean' ? p.open : NAV_DOCK_DEFAULTS.open,
      width: typeof p.width === 'number' ? labeledWidthFromLive(p.width) : NAV_DOCK_DEFAULTS.width,
      iconMode: typeof p.iconMode === 'boolean' ? p.iconMode : NAV_DOCK_DEFAULTS.iconMode,
    }
  } catch {
    return { ...NAV_DOCK_DEFAULTS }
  }
}

export function writeNavDockPersist(state: NavDockPersist) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function useNavDock() {
  const open = useState('bros-nav-open', () => NAV_DOCK_DEFAULTS.open)
  const width = useState('bros-nav-width', () => NAV_DOCK_DEFAULTS.width)
  const iconMode = useState('bros-nav-icon', () => NAV_DOCK_DEFAULTS.iconMode)
  const mobileOpen = useState('bros-nav-mobile', () => false)
  const isDesktop = useState('bros-nav-desktop', () => false)
  const hydrated = useState('bros-nav-hydrated', () => false)

  function persist() {
    if (!iconMode.value) width.value = labeledWidthFromLive(width.value)
    writeNavDockPersist({
      open: open.value,
      width: width.value,
      iconMode: iconMode.value,
    })
  }

  function applyPersist(p: NavDockPersist) {
    open.value = p.open
    width.value = p.width
    iconMode.value = p.iconMode
  }

  function hydrate() {
    if (hydrated.value) return
    applyPersist(readNavDockPersist())
    isDesktop.value = window.matchMedia(DESKTOP_MQ).matches
    hydrated.value = true
  }

  function toggleDesktop() {
    open.value = !open.value
    persist()
  }

  function closeDesktop() {
    open.value = false
    persist()
  }

  function toggleIconMode() {
    iconMode.value = !iconMode.value
    persist()
  }

  function applyResizeDelta(startWidth: number, deltaX: number) {
    const live = clampLiveWidth(startWidth + deltaX)
    const nextIcon = iconModeForWidth(live, iconMode.value)
    if (nextIcon) {
      if (!iconMode.value) width.value = labeledWidthFromLive(width.value)
      iconMode.value = true
      return
    }
    iconMode.value = false
    width.value = live
  }

  function openMobile() {
    mobileOpen.value = true
  }

  function closeMobile() {
    mobileOpen.value = false
  }

  function toggleMobile() {
    mobileOpen.value = !mobileOpen.value
  }

  const panelVisible = computed(() => (isDesktop.value ? open.value : mobileOpen.value))
  const dockWidth = computed(() => (iconMode.value ? ICON_WIDTH : width.value))

  return {
    open,
    width,
    iconMode,
    mobileOpen,
    isDesktop,
    hydrated,
    panelVisible,
    dockWidth,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    iconWidth: ICON_WIDTH,
    snapToIcon: SNAP_TO_ICON,
    snapToLabels: SNAP_TO_LABELS,
    hydrate,
    persist,
    toggleDesktop,
    closeDesktop,
    toggleIconMode,
    applyResizeDelta,
    openMobile,
    closeMobile,
    toggleMobile,
  }
}
