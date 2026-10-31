<script setup lang="ts">
withDefaults(defineProps<{
  brand?: string
  brandTo?: string
}>(), {
  brand: 'Bros',
  brandTo: '/',
})

const { open, isDesktop, hydrate, toggleDesktop, toggleMobile } = useNavDock()

onMounted(() => {
  hydrate()
})

const showDesktopToggle = computed(() => isDesktop.value && !open.value)
const showBrand = computed(() => !isDesktop.value || !open.value)
const showHamburger = computed(() => !isDesktop.value)
</script>

<template>
  <header class="bros-nav-bar">
    <button
      v-if="showHamburger"
      type="button"
      class="bros-nav-bar__btn"
      aria-controls="bros-nav-panel"
      aria-label="Open navigation"
      @click="toggleMobile"
    >
      <UIcon name="i-lucide-menu" class="size-4" />
    </button>
    <button
      v-else-if="showDesktopToggle"
      type="button"
      class="bros-nav-bar__btn"
      :aria-expanded="open"
      aria-controls="bros-nav-panel"
      aria-label="Open navigation dock"
      @click="toggleDesktop"
    >
      <UIcon name="i-lucide-panel-left" class="size-4" />
    </button>
    <NuxtLink v-if="showBrand" :to="brandTo" class="bros-nav-bar__brand">
      {{ brand }}
    </NuxtLink>
  </header>
</template>

<style scoped>
.bros-nav-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.75rem;
  min-height: 3rem;
  padding: 0.5rem 1rem;
  background: #0e141c;
  border-bottom: 1px solid #2a3544;
}

.bros-nav-bar__btn {
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

.bros-nav-bar__btn:hover {
  border-color: #3d9cf0;
  color: #ffffff;
}

.bros-nav-bar__brand {
  font-size: 1rem;
  font-weight: 650;
  color: #ffffff;
  text-decoration: none;
}
</style>
