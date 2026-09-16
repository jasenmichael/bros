<script setup lang="ts">
withDefaults(defineProps<{
  brand?: string
  brandTo?: string
}>(), {
  brand: 'Bros',
  brandTo: '/',
})

const open = useState('bros-nav-panel-open', () => true)

function toggle() {
  open.value = !open.value
}
</script>

<template>
  <header class="bros-nav-bar">
    <button
      type="button"
      class="bros-nav-bar__btn"
      :aria-expanded="open"
      aria-controls="bros-nav-panel"
      :aria-label="open ? 'Close navigation panel' : 'Open navigation panel'"
      @click="toggle"
    >
      <UIcon :name="open ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left'" class="size-4" />
    </button>
    <NuxtLink :to="brandTo" class="bros-nav-bar__brand">
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
