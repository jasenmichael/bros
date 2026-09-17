<script setup lang="ts">
export interface NavItem {
  label: string
  to: string
  icon?: string
  external?: boolean
  exact?: boolean
}

const props = withDefaults(defineProps<{
  brand?: string
  brandTo?: string
  items?: NavItem[]
  bottomItems?: NavItem[]
  pinnedItems?: NavItem[]
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
  panelVisible,
  dockWidth,
  hydrate,
  persist,
  closeDesktop,
  toggleIconMode,
  applyResizeDelta,
  closeMobile,
} = useNavDock()

const route = useRoute()
onMounted(() => {
  hydrate()
  const mq = window.matchMedia('(min-width: 1024px)')
  const onMq = () => {
    isDesktop.value = mq.matches
    if (mq.matches) closeMobile()
  }
  mq.addEventListener('change', onMq)
  onMq()
})

watch(() => route.fullPath, () => {
  if (!isDesktop.value) closeMobile()
})

const resizing = ref(false)
let resizeStartX = 0
let resizeStartW = 0

function onResizeStart(ev: PointerEvent) {
  if (!isDesktop.value) return
  ev.stopPropagation()
  resizing.value = true
  resizeStartX = ev.clientX
  resizeStartW = dockWidth.value
  ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
}

function onPointerMove(ev: PointerEvent) {
  if (!resizing.value) return
  applyResizeDelta(resizeStartW, ev.clientX - resizeStartX)
}

function onPointerUp() {
  if (resizing.value) persist()
  resizing.value = false
}

const dockStyle = computed(() => {
  if (!isDesktop.value) return undefined
  return { width: `${dockWidth.value}px` }
})

function linkTitle(item: NavItem) {
  return iconMode.value ? item.label : undefined
}

function linkActiveClass(item: NavItem) {
  return item.exact ? '' : 'bros-nav-panel__link--active'
}

function linkExactActiveClass(item: NavItem) {
  return item.exact ? 'bros-nav-panel__link--active' : undefined
}
</script>

<template>
  <div
    v-if="!isDesktop && panelVisible"
    class="bros-nav-backdrop"
    @click="closeMobile"
  />
  <aside
    v-show="panelVisible"
    id="bros-nav-panel"
    class="bros-nav-panel"
    :class="{
      'bros-nav-panel--desktop': isDesktop,
      'bros-nav-panel--mobile': !isDesktop,
      'bros-nav-panel--icon': iconMode && isDesktop,
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
          <span v-if="iconMode && isDesktop">B</span>
          <span v-else>{{ brand }}</span>
        </NuxtLink>
        <div class="bros-nav-panel__head-actions">
          <button
            v-if="isDesktop"
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
            :aria-label="isDesktop ? 'Close navigation dock' : 'Close navigation'"
            @click="isDesktop ? closeDesktop() : closeMobile()"
          >
            <UIcon :name="isDesktop ? 'i-lucide-panel-left-close' : 'i-lucide-x'" class="size-4" />
          </button>
        </div>
      </div>

      <nav class="bros-nav-panel__nav" aria-label="Primary">
        <NuxtLink
          v-for="item in props.items"
          :key="item.to"
          :to="item.to"
          :target="item.external ? '_blank' : undefined"
          class="bros-nav-panel__link"
          :active-class="linkActiveClass(item)"
          :exact-active-class="linkExactActiveClass(item)"
          :title="linkTitle(item)"
        >
          <UIcon v-if="item.icon" :name="item.icon" class="size-4 shrink-0" />
          <span v-if="!(iconMode && isDesktop)">{{ item.label }}</span>
        </NuxtLink>

        <div v-if="$slots['after-primary']" class="bros-nav-panel__recents">
          <slot name="after-primary" />
        </div>

        <div
          v-if="props.bottomItems.length || props.showPinned"
          class="bros-nav-panel__bottom"
        >
          <template v-if="props.showPinned">
            <div
              v-if="props.pinnedItems.length || !(iconMode && isDesktop)"
              class="bros-nav-panel__divider"
              role="separator"
              aria-label="Pinned"
            />
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
              <span v-if="!(iconMode && isDesktop)">{{ item.label }}</span>
            </a>
            <p v-if="!props.pinnedItems.length && !(iconMode && isDesktop)" class="bros-nav-panel__hint">
              Pin a sidecar web UI from Sidecars to show it here.
            </p>
          </template>

          <template v-if="props.bottomItems.length">
            <div class="bros-nav-panel__divider" />
            <NuxtLink
              v-for="item in props.bottomItems"
              :key="item.to"
              :to="item.to"
              :target="item.external ? '_blank' : undefined"
              class="bros-nav-panel__link"
              active-class="bros-nav-panel__link--active"
              :title="linkTitle(item)"
            >
              <UIcon v-if="item.icon" :name="item.icon" class="size-4 shrink-0" />
              <span v-if="!(iconMode && isDesktop)">{{ item.label }}</span>
            </NuxtLink>
          </template>
        </div>
      </nav>

      <a
        href="https://github.com/jasenmichael/bros"
        target="_blank"
        rel="noopener"
        class="bros-nav-panel__footer"
        title="GitHub"
      >
        <UIcon name="i-lucide-github" class="size-4 shrink-0" />
        <span v-if="!(iconMode && isDesktop)">GitHub</span>
      </a>
    </div>
    <button
      v-if="isDesktop"
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
  height: 100vh;
  border: 0;
  border-right: 1px solid #2a3544;
}

.bros-nav-panel--mobile {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 50;
  width: 16rem;
  height: 100vh;
  border-radius: 0;
  border-right: 1px solid #2a3544;
}

.bros-nav-panel__inner {
  display: flex;
  height: 100%;
  width: 100%;
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
  min-height: 0;
  overflow: hidden;
  padding: 0.75rem 0.5rem 0.5rem;
}

.bros-nav-panel__recents {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}

.bros-nav-panel__link {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.15rem;
  padding: 0.55rem 0.65rem;
  border-radius: 0.4rem;
  color: #c5d0dc;
  text-decoration: none;
  font-size: 0.925rem;
}

.bros-nav-panel--icon .bros-nav-panel__link {
  justify-content: center;
  padding: 0.55rem 0.35rem;
}

.bros-nav-panel__link:hover {
  background: #1a222c;
  color: #ffffff;
}

.bros-nav-panel__link--active {
  background: #1e2a38;
  color: #ffffff;
  box-shadow: inset 2px 0 0 #3d9cf0;
}

.bros-nav-panel__hint {
  margin: 0.25rem 0 0;
  padding: 0 0.65rem;
  font-size: 0.75rem;
  line-height: 1.35;
  color: #8b9bb0;
}

.bros-nav-panel__bottom {
  margin-top: auto;
  padding-top: 0.5rem;
}

.bros-nav-panel__divider {
  height: 1px;
  margin: 0.35rem 0.5rem 0.65rem;
  background: #2a3544;
}

.bros-nav-panel__footer {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border-top: 1px solid #2a3544;
  padding: 0.75rem 1rem;
  color: #8b9bb0;
  text-decoration: none;
  font-size: 0.85rem;
}

.bros-nav-panel--icon .bros-nav-panel__footer {
  justify-content: center;
  padding: 0.75rem 0.35rem;
}

.bros-nav-panel__footer:hover {
  color: #ffffff;
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
