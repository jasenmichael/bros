<script setup lang="ts">
const navItems = [
  { label: 'Dashboard', to: '/', icon: 'i-lucide-layout-dashboard' },
  { label: 'New chat', to: '/chat', icon: 'i-lucide-message-square', exact: true },
  { label: 'Models', to: '/models', icon: 'i-lucide-cpu' },
  { label: 'Sidecars', to: '/sidecars', icon: 'i-lucide-container' },
  { label: 'Status', to: '/status', icon: 'i-lucide-activity' },
]

const bottomItems = [
  { label: 'Docs', to: '/docs', icon: 'i-lucide-book-open' },
  { label: 'Settings', to: '/settings', icon: 'i-lucide-settings' },
]

const { pinnedItems } = usePinnedNav()
</script>

<template>
  <div class="bros-app-frame">
    <BrosAppNav
      brand="Bros"
      brand-to="/"
      :items="navItems"
      :bottom-items="bottomItems"
      :pinned-items="pinnedItems"
      show-pinned
    >
      <template #after-primary>
        <BrosChatRecents />
      </template>
    </BrosAppNav>
    <div class="bros-app-frame__main">
      <BrosNavBar brand="Bros" brand-to="/" />
      <NuxtPage />
    </div>
  </div>
</template>

<style scoped>
.bros-app-frame {
  display: flex;
  min-height: 100vh;
  background: #0f1419;
}

.bros-app-frame__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  background: #0f1419;
}
</style>
