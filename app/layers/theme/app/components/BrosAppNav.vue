<script setup lang="ts">
import type { BrosNavItem } from '../types/nav'
import { applySectionDrag, MIN_SECTION_FLEX } from '../composables/useNavDock'

const props = withDefaults(defineProps<{
  brand?: string
  brandTo?: string
  items?: BrosNavItem[]
  bottomItems?: BrosNavItem[]
  pinnedItems?: BrosNavItem[]
  showPinned?: boolean
}>(), {
  brand: 'Bros',
  brandTo: '/',
  items: () => [
    { label: 'Docs', to: '/docs', icon: 'i-lucide-book-open' },
  ],
  bottomItems: () => [],
  pinnedItems: () => [],
  showPinned: false,
})

const {
  iconMode,
  isDesktop,
  overlayNav,
  panelVisible,
  dockWidth,
  sectionPrimary,
  sectionChat,
  sectionPinned,
  hydrate,
  persist,
  persistSections,
  closeDesktop,
  toggleIconMode,
  applyResizeDelta,
  closeMobile,
} = useNavDock()

const route = useRoute()
const navBody = ref<HTMLElement | null>(null)

onMounted(() => {
  hydrate()
  const mq = window.matchMedia('(min-width: 1024px)')
  const onMq = () => {
    isDesktop.value = mq.matches
    if (mq.matches && !overlayNav.value) closeMobile()
  }
  mq.addEventListener('change', onMq)
  onMq()
})

watch(() => route.fullPath, () => {
  closeMobile()
})

const resizing = ref(false)
let resizeStartX = 0
let resizeStartW = 0

function onResizeStart(ev: PointerEvent) {
  if (overlayNav.value) return
  ev.stopPropagation()
  resizing.value = true
  resizeStartX = ev.clientX
  resizeStartW = dockWidth.value
  ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
}

function onPointerMove(ev: PointerEvent) {
  if (sectionDrag) {
    const dy = ev.clientY - sectionDrag.startY
    const [a, b] = sectionDrag.kind === 'primary-chat'
      ? applySectionDrag(sectionDrag.a, sectionDrag.b, dy, sectionDrag.span, 0, 0)
      : applySectionDrag(sectionDrag.a, sectionDrag.b, dy, sectionDrag.span, 0, MIN_SECTION_FLEX)
    if (sectionDrag.kind === 'primary-chat') {
      sectionPrimary.value = a
      sectionChat.value = b
    } else if (sectionDrag.kind === 'chat-pinned') {
      sectionChat.value = a
      sectionPinned.value = b
    } else if (sectionDrag.kind === 'primary-pinned') {
      sectionPrimary.value = a
      sectionPinned.value = b
    }
    return
  }
  if (!resizing.value) return
  applyResizeDelta(resizeStartW, ev.clientX - resizeStartX)
}

function onPointerUp() {
  if (sectionDrag) {
    persistSections()
    sectionDrag = null
  }
  if (resizing.value) persist()
  resizing.value = false
}

const dockStyle = computed(() => {
  if (overlayNav.value) return undefined
  return { width: `${dockWidth.value}px` }
})

const slots = useSlots()
const showIconChrome = computed(() => iconMode.value && !overlayNav.value)
const hasChat = computed(() => !!slots['after-primary'])
const hasPinned = computed(() => props.showPinned)
const hasFooter = computed(() => props.bottomItems.length > 0)

type SectionDrag = {
  kind: 'primary-chat' | 'chat-pinned' | 'primary-pinned'
  startY: number
  a: number
  b: number
  span: number
}
let sectionDrag: SectionDrag | null = null

function sectionTotal() {
  let n = sectionPrimary.value
  if (hasChat.value) n += sectionChat.value
  if (hasPinned.value) n += sectionPinned.value
  return Math.max(n, 0.01)
}

function onSectionDragStart(kind: SectionDrag['kind'], ev: PointerEvent) {
  ev.preventDefault()
  ev.stopPropagation()
  const body = navBody.value
  if (!body) return
  const h = body.clientHeight
  const total = sectionTotal()
  const pair
    = kind === 'primary-chat' ? [sectionPrimary.value, sectionChat.value] as const
      : kind === 'chat-pinned' ? [sectionChat.value, sectionPinned.value] as const
        : [sectionPrimary.value, sectionPinned.value] as const
  const pairSum = pair[0] + pair[1]
  const span = pairSum > 0 ? h * (pairSum / total) : Math.max(120, h * 0.25)
  sectionDrag = {
    kind,
    startY: ev.clientY,
    a: pair[0],
    b: pair[1],
    span: Math.max(1, span),
  }
  ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
}
</script>

<template>
  <div
    v-if="overlayNav && panelVisible"
    class="bros-nav-backdrop"
    @click="closeMobile"
  />
  <aside
    v-show="panelVisible"
    id="bros-nav-panel"
    class="bros-nav-panel"
    :class="{
      'bros-nav-panel--desktop': !overlayNav,
      'bros-nav-panel--mobile': overlayNav,
      'bros-nav-panel--icon': showIconChrome,
    }"
    :style="dockStyle"
    :aria-hidden="!panelVisible"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div class="bros-nav-panel__inner">
      <div class="bros-nav-panel__head">
        <NuxtLink
          :to="brandTo"
          class="bros-nav-panel__brand"
          :title="brand"
        >
          <span v-if="showIconChrome">B</span>
          <span v-else>{{ brand }}</span>
        </NuxtLink>
        <div class="bros-nav-panel__head-actions">
          <button
            v-if="!overlayNav"
            type="button"
            class="bros-nav-panel__icon-btn"
            :aria-label="iconMode ? 'Show labels' : 'Icon mode'"
            :title="iconMode ? 'Show labels' : 'Icon mode'"
            @click="toggleIconMode"
          >
            <UIcon :name="iconMode ? 'i-lucide-panel-left' : 'i-lucide-square'" class="size-4" />
          </button>
          <button
            type="button"
            class="bros-nav-panel__icon-btn"
            :aria-label="overlayNav ? 'Close navigation' : 'Close navigation dock'"
            @click="overlayNav ? closeMobile() : closeDesktop()"
          >
            <UIcon :name="overlayNav ? 'i-lucide-x' : 'i-lucide-panel-left-close'" class="size-4" />
          </button>
        </div>
      </div>

      <nav ref="navBody" class="bros-nav-panel__nav" aria-label="Primary">
        <div
          class="bros-nav-panel__section bros-nav-panel__section--primary bros-nav-panel__scroll"
          :style="{ flex: `${sectionPrimary} 0 auto` }"
        >
          <BrosNavTree :items="props.items" :icon-mode="showIconChrome" />
        </div>

        <button
          v-if="hasChat"
          type="button"
          class="bros-nav-panel__divider bros-nav-panel__divider--drag"
          aria-label="Resize chat section"
          @pointerdown="onSectionDragStart('primary-chat', $event)"
        />

        <div
          v-if="hasChat"
          class="bros-nav-panel__section bros-nav-panel__section--chat"
          :style="{ flex: `${sectionChat} 0 auto` }"
        >
          <slot name="after-primary" />
        </div>

        <button
          v-if="hasPinned && (hasChat || props.items.length)"
          type="button"
          class="bros-nav-panel__divider bros-nav-panel__divider--drag"
          aria-label="Resize pinned section"
          @pointerdown="onSectionDragStart(hasChat ? 'chat-pinned' : 'primary-pinned', $event)"
        />

        <div
          v-if="hasPinned"
          class="bros-nav-panel__section bros-nav-panel__scroll"
          :style="{ flex: `${sectionPinned} 1 0` }"
          aria-label="Pinned"
        >
          <a
            v-for="item in props.pinnedItems"
            :key="item.to"
            :href="item.to"
            :target="item.external ? '_blank' : undefined"
            rel="noopener"
            class="bros-nav-panel__link"
            :title="item.label"
          >
            <UIcon :name="item.icon || 'i-lucide-pin'" class="size-4 shrink-0" />
            <span v-if="!showIconChrome" class="bros-nav-label">{{ item.label }}</span>
          </a>
          <p v-if="!props.pinnedItems.length && !showIconChrome" class="bros-nav-panel__hint">
            Pin an app web UI from Apps to show it here.
          </p>
        </div>

        <div
          v-if="hasFooter && (hasPinned || hasChat || props.items.length)"
          class="bros-nav-panel__divider"
          role="separator"
          aria-label="Footer"
        />

        <div
          v-if="hasFooter"
          class="bros-nav-panel__section bros-nav-panel__section--footer bros-nav-panel__scroll"
        >
          <BrosNavTree
            :items="props.bottomItems"
            :icon-mode="showIconChrome"
          />
          <a
            href="https://github.com/jasenmichael/bros"
            target="_blank"
            rel="noopener"
            class="bros-nav-panel__link"
            title="GitHub"
          >
            <UIcon name="i-lucide-github" class="size-4 shrink-0" />
            <span v-if="!showIconChrome" class="bros-nav-label">GitHub</span>
          </a>
        </div>
      </nav>
    </div>
    <button
      v-if="!overlayNav"
      type="button"
      class="bros-nav-panel__resize"
      aria-label="Resize navigation dock"
      @pointerdown="onResizeStart"
    />
  </aside>
</template>

<style scoped>
.bros-nav-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.5);
}

.bros-nav-panel {
  overflow: hidden;
  background: #121820;
  color: #e8eef5;
  border: 1px solid #2a3544;
}

.bros-nav-panel--desktop {
  position: sticky;
  top: 0;
  z-index: 30;
  align-self: flex-start;
  flex-shrink: 0;
  height: 100dvh;
  border: 0;
  border-right: 1px solid #2a3544;
}

.bros-nav-panel--mobile {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 50;
  width: 16rem;
  height: 100dvh;
  border-radius: 0;
  border-right: 1px solid #2a3544;
}

.bros-nav-panel__inner {
  display: flex;
  height: 100%;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  background: #121820;
}

.bros-nav-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-bottom: 1px solid #2a3544;
  background: #0e141c;
  padding: 0.75rem 0.65rem;
}

.bros-nav-panel__head-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.bros-nav-panel__brand {
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: #ffffff;
  text-decoration: none;
}

.bros-nav-panel--icon .bros-nav-panel__brand {
  width: 1.5rem;
  text-align: center;
}

.bros-nav-panel__brand:hover {
  color: #3d9cf0;
}

.bros-nav-panel__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid #2a3544;
  border-radius: 0.4rem;
  background: #1a222c;
  color: #e8eef5;
  cursor: pointer;
}

.bros-nav-panel__icon-btn:hover {
  border-color: #3d9cf0;
  color: #ffffff;
}

.bros-nav-panel__nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 0.75rem 0.5rem 0.5rem;
}

.bros-nav-panel__section {
  display: flex;
  min-width: 0;
  min-height: 3rem;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.bros-nav-panel__section::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.bros-nav-panel__section--primary,
.bros-nav-panel__section--chat {
  /* default flex grow 0 → divider flush under content (Agents / Previous chats) */
  flex-shrink: 0;
  min-height: min-content;
}

.bros-nav-panel__section--primary {
  overflow-y: visible;
}

.bros-nav-panel__section--chat {
  overflow: hidden;
}

.bros-nav-panel__section--footer {
  flex: 0 0 auto;
  min-height: 0;
  max-height: 40%;
}

.bros-nav-panel__scroll {
  /* alias kept for tests / callers */
}

.bros-nav-panel__link {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.15rem;
  padding: 0.55rem 0.65rem;
  border-radius: 0.4rem;
  color: #c5d0dc;
  text-decoration: none;
  font-size: 0.925rem;
}

.bros-nav-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bros-nav-panel--icon .bros-nav-panel__link {
  justify-content: center;
  padding: 0.55rem 0.35rem;
}

.bros-nav-panel__link:hover {
  background: #1a222c;
  color: #ffffff;
}

.bros-nav-panel__hint {
  margin: 0.25rem 0 0;
  padding: 0 0.65rem;
  font-size: 0.75rem;
  line-height: 1.35;
  color: #8b9bb0;
}

.bros-nav-panel__divider {
  flex-shrink: 0;
  height: 1px;
  margin: 0.35rem 0.5rem;
  border: 0;
  padding: 0;
  background: #2a3544;
}

.bros-nav-panel__divider--drag {
  position: relative;
  height: 7px;
  margin: 0.15rem 0.35rem;
  background: transparent;
  cursor: ns-resize;
}

.bros-nav-panel__divider--drag::after {
  content: "";
  position: absolute;
  left: 0.15rem;
  right: 0.15rem;
  top: 50%;
  height: 1px;
  transform: translateY(-50%);
  background: #2a3544;
}

.bros-nav-panel__divider--drag:hover::after,
.bros-nav-panel__divider--drag:focus-visible::after {
  background: #3d9cf0;
}

.bros-nav-panel__resize {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  width: 6px;
  height: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: ew-resize;
}

.bros-nav-panel__resize:hover {
  background: rgba(61, 156, 240, 0.35);
}
</style>
