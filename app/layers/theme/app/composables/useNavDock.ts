export type NavDockPersist = {
  open: boolean
  width: number
  iconMode: boolean
}

export type NavSectionPersist = {
  primary: number
  chat: number
  pinned: number
}

const STORAGE_KEY = 'bros-nav-dock'
const SECTION_KEY = 'bros-nav-sections-v3'
const DESKTOP_MQ = '(min-width: 1024px)'

export const ICON_WIDTH = 56
export const SNAP_TO_ICON = 80
export const SNAP_TO_LABELS = 112
export const MIN_WIDTH = 160
export const MAX_WIDTH = 420
export const MIN_SECTION_FLEX = 0.35

export const NAV_DOCK_DEFAULTS: NavDockPersist = {
  open: true,
  width: 256,
  iconMode: false,
}

export const NAV_SECTION_DEFAULTS: NavSectionPersist = {
  /** 0 = content-sized (flush under Agents / under Previous chats) */
  primary: 0,
  chat: 0,
  pinned: 1,
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

function readFlex(n: unknown, fallback: number, allowZero = false) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  if (allowZero ? n < 0 : n <= 0) return fallback
  return n
}

export function readNavSectionPersist(): NavSectionPersist {
  if (typeof localStorage === 'undefined') return { ...NAV_SECTION_DEFAULTS }
  try {
    const raw = localStorage.getItem(SECTION_KEY)
    if (!raw) return { ...NAV_SECTION_DEFAULTS }
    const p = JSON.parse(raw) as Partial<NavSectionPersist> & { bottom?: number }
    return {
      primary: readFlex(p.primary, NAV_SECTION_DEFAULTS.primary, true),
      chat: readFlex(p.chat, NAV_SECTION_DEFAULTS.chat, true),
      pinned: readFlex(p.pinned ?? p.bottom, NAV_SECTION_DEFAULTS.pinned),
    }
  } catch {
    return { ...NAV_SECTION_DEFAULTS }
  }
}

export function writeNavSectionPersist(state: NavSectionPersist) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(SECTION_KEY, JSON.stringify(state))
}

/** Split deltaPx across two neighboring section flex weights. */
export function applySectionDrag(
  a: number,
  b: number,
  deltaPx: number,
  spanPx: number,
  minA = MIN_SECTION_FLEX,
  minB = minA,
): [number, number] {
  if (spanPx <= 0) return [a, b]
  const total = a + b
  // Both content-sized (0): drag assigns weight to the side being expanded.
  if (total <= 0) {
    const w = Math.abs(deltaPx) / spanPx
    if (deltaPx >= 0) return [Math.max(minA, w), Math.max(minB, b)]
    return [Math.max(minA, a), Math.max(minB, w)]
  }
  let nextA = a + (deltaPx * total) / spanPx
  let nextB = total - nextA
  if (nextA < minA) {
    nextA = minA
    nextB = total - minA
  }
  if (nextB < minB) {
    nextB = minB
    nextA = total - minB
  }
  return [Math.max(minA, nextA), Math.max(minB, nextB)]
}

export function useNavDock() {
  const route = useRoute()
  const open = useState('bros-nav-open', () => NAV_DOCK_DEFAULTS.open)
  const width = useState('bros-nav-width', () => NAV_DOCK_DEFAULTS.width)
  const iconMode = useState('bros-nav-icon', () => NAV_DOCK_DEFAULTS.iconMode)
  const mobileOpen = useState('bros-nav-mobile', () => false)
  const isDesktop = useState('bros-nav-desktop', () => false)
  const hydrated = useState('bros-nav-hydrated', () => false)
  const sectionPrimary = useState('bros-nav-sec-primary-v3', () => NAV_SECTION_DEFAULTS.primary)
  const sectionChat = useState('bros-nav-sec-chat-v3', () => NAV_SECTION_DEFAULTS.chat)
  const sectionPinned = useState('bros-nav-sec-pinned-v3', () => NAV_SECTION_DEFAULTS.pinned)

  // /desktop keeps Selkies iframe width: overlay nav, never a dock column.
  const overlayNav = computed(() => !isDesktop.value || route.path === '/desktop')

  function persist() {
    if (!iconMode.value) width.value = labeledWidthFromLive(width.value)
    writeNavDockPersist({
      open: open.value,
      width: width.value,
      iconMode: iconMode.value,
    })
  }

  function persistSections() {
    writeNavSectionPersist({
      primary: sectionPrimary.value,
      chat: sectionChat.value,
      pinned: sectionPinned.value,
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
    const sec = readNavSectionPersist()
    sectionPrimary.value = sec.primary
    sectionChat.value = sec.chat
    sectionPinned.value = sec.pinned
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

  const panelVisible = computed(() => (overlayNav.value ? mobileOpen.value : open.value))
  const dockWidth = computed(() => (iconMode.value ? ICON_WIDTH : width.value))

  return {
    open,
    width,
    iconMode,
    mobileOpen,
    isDesktop,
    overlayNav,
    hydrated,
    panelVisible,
    dockWidth,
    sectionPrimary,
    sectionChat,
    sectionPinned,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    iconWidth: ICON_WIDTH,
    snapToIcon: SNAP_TO_ICON,
    snapToLabels: SNAP_TO_LABELS,
    hydrate,
    persist,
    persistSections,
    toggleDesktop,
    closeDesktop,
    toggleIconMode,
    applyResizeDelta,
    openMobile,
    closeMobile,
    toggleMobile,
  }
}
