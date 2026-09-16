<script setup lang="ts">
const items = useNavItems()
</script>

<template>
  <div class="bros-shell">
    <AppNav :items="items" />
    <main class="bros-main">
      <slot />
    </main>
  </div>
</template>
