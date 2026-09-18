<script setup lang="ts">
const { bros } = useAppConfig()
const { pinnedItems } = useBrosPinnedNav()
</script>

<template>
  <div class="bros-app-frame">
    <BrosAppNav
      :brand="bros.brand"
      :brand-to="bros.brandTo"
      :items="bros.navItems"
      :bottom-items="bros.bottomItems"
      :pinned-items="pinnedItems"
      :show-pinned="bros.showPinned"
    >
      <template v-if="bros.showAfterPrimary" #after-primary>
        <BrosNavAfterPrimary />
      </template>
    </BrosAppNav>
    <div class="bros-app-frame__main">
      <BrosNavBar :brand="bros.brand" :brand-to="bros.brandTo" />
      <slot />
    </div>
  </div>
</template>

<style scoped>
.bros-app-frame {
  display: flex;
  height: 100dvh;
  overflow: hidden;
  background: #0f1419;
}

.bros-app-frame__main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  background: #0f1419;
}
</style>
