<script setup lang="ts">
const props = defineProps<{
  href?: string
  target?: string
}>()

const href = computed(() => docsLinkHref(props.href || ''))
</script>

<template>
  <NuxtLink
    :href="href"
    :target="props.target"
  >
    <slot />
  </NuxtLink>
</template>
