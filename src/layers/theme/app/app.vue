<script setup lang="ts">
const colorMode = useColorMode()
colorMode.preference = 'dark'
</script>

<template>
  <UApp :toaster="{ position: 'bottom-right' }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
