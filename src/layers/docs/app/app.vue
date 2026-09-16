<script setup lang="ts">
/**
 * Default shell for the docs layer / static docs site.
 * Bros app replaces this with its own app.vue (dashboard nav).
 */
const navItems = [
  { label: 'Home', to: '/', icon: 'i-lucide-home' },
  { label: 'Getting started', to: '/docs/getting-started', icon: 'i-lucide-rocket' },
  { label: 'Sidecars', to: '/docs/sidecars', icon: 'i-lucide-container' },
  { label: 'Configuration', to: '/docs/configuration', icon: 'i-lucide-settings' },
]
</script>

<template>
  <div class="bros-app-frame">
    <BrosAppNav brand="Bros" brand-to="/" :items="navItems" />
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
