<script setup lang="ts">
import type { BrosNavItem } from '../../layers/theme/app/types/nav'

const { iconMode, overlayNav } = useNavDock()
const showIconChrome = computed(() => iconMode.value && !overlayNav.value)

const newChat: BrosNavItem[] = [
  { label: 'New chat', to: '/chat', icon: 'i-lucide-message-square', exact: true },
]
</script>

<template>
  <div class="bros-nav-after">
    <BrosNavTree :items="newChat" :icon-mode="showIconChrome" />
    <BrosChatRecents />
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
