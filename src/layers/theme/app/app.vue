<script setup lang="ts">
const colorMode = useColorMode()
colorMode.preference = 'dark'
</script>

<template>
  <div class="min-h-screen text-slate-100">
    <slot />
  </div>
</template>
