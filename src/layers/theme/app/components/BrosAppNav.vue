<script setup lang="ts">
export interface NavItem {
  label: string
  to: string
  icon?: string
  external?: boolean
}

const props = withDefaults(defineProps<{
  brand?: string
  brandTo?: string
  items?: NavItem[]
  pinnedItems?: NavItem[]
  showPinned?: boolean
}>(), {
  brand: 'Bros',
  brandTo: '/',
  items: () => [
    { label: 'Docs', to: '/docs', icon: 'i-lucide-book-open' },
  ],
  pinnedItems: () => [],
  showPinned: false,
})

/** Docked nav panel open state (persists across routes). Default open. */
const open = useState('bros-nav-panel-open', () => true)

function close() {
  open.value = false
}
</script>

<template>
  <aside
    id="bros-nav-panel"
    class="bros-nav-panel"
    :class="{ 'bros-nav-panel--open': open }"
    :aria-hidden="!open"
  >
    <div class="bros-nav-panel__inner">
      <div class="bros-nav-panel__head">
        <NuxtLink :to="brandTo" class="bros-nav-panel__brand">
          {{ brand }}
        </NuxtLink>
        <button
          type="button"
          class="bros-nav-panel__icon-btn"
          aria-label="Close navigation panel"
          @click="close"
        >
          <UIcon name="i-lucide-panel-left-close" class="size-4" />
        </button>
      </div>

      <nav class="bros-nav-panel__nav" aria-label="Primary">
        <p class="bros-nav-panel__label">App</p>
        <NuxtLink
          v-for="item in props.items"
          :key="item.to"
          :to="item.to"
          :target="item.external ? '_blank' : undefined"
          class="bros-nav-panel__link"
          active-class="bros-nav-panel__link--active"
        >
          <UIcon v-if="item.icon" :name="item.icon" class="size-4 shrink-0" />
          <span>{{ item.label }}</span>
        </NuxtLink>

        <template v-if="props.showPinned">
          <p class="bros-nav-panel__label bros-nav-panel__label--spaced">Pinned</p>
          <a
            v-for="item in props.pinnedItems"
            :key="item.to"
            :href="item.to"
            :target="item.external ? '_blank' : undefined"
            rel="noopener"
            class="bros-nav-panel__link"
          >
            <UIcon :name="item.icon || 'i-lucide-pin'" class="size-4 shrink-0" />
            <span>{{ item.label }}</span>
          </a>
          <p v-if="!props.pinnedItems.length" class="bros-nav-panel__hint">
            Pin a sidecar web UI from Sidecars to show it here.
          </p>
        </template>
      </nav>
    </div>
  </aside>
</template>

<style scoped>
.bros-nav-panel {
  position: sticky;
  top: 0;
  z-index: 30;
  align-self: flex-start;
  height: 100vh;
  width: 0;
  flex-shrink: 0;
  overflow: hidden;
  background: #121820;
  border-right: 1px solid transparent;
  transition: width 0.2s ease, border-color 0.2s ease;
}

.bros-nav-panel--open {
  width: 16rem;
  border-right-color: #2a3544;
}

.bros-nav-panel__inner {
  display: flex;
  height: 100%;
  width: 16rem;
  flex-direction: column;
  background: #121820;
  color: #e8eef5;
}

.bros-nav-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-bottom: 1px solid #2a3544;
  background: #0e141c;
  padding: 0.85rem 0.75rem 0.85rem 1rem;
}

.bros-nav-panel__brand {
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: #ffffff;
  text-decoration: none;
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
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 0.5rem 1rem;
}

.bros-nav-panel__label {
  margin: 0 0 0.35rem;
  padding: 0 0.65rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #8b9bb0;
}

.bros-nav-panel__label--spaced {
  margin-top: 1.25rem;
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
</style>
