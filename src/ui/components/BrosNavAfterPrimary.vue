<script setup lang="ts">
import type { BrosNavItem } from '../layers/theme/app/types/nav'

const { iconMode, isDesktop } = useNavDock()

const newChat: BrosNavItem[] = [
  { label: 'New chat', to: '/chat', icon: 'i-lucide-message-square', exact: true },
]

const afterRecents: BrosNavItem[] = [
  { label: 'Agents', to: '/agents', icon: 'i-lucide-list-todo', exact: true },
  { label: 'Providers', to: '/providers', icon: 'i-lucide-cpu' },
]
</script>

<template>
  <div class="bros-nav-after">
    <div class="bros-nav-panel__divider" role="separator" aria-label="Chat" />
    <BrosNavTree :items="newChat" :icon-mode="iconMode && isDesktop" />
    <BrosChatRecents />
    <BrosNavTree :items="afterRecents" :icon-mode="iconMode && isDesktop" />
  </div>
</template>

<style scoped>
.bros-nav-after {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.bros-nav-after :deep(.bros-recents) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
</style>
