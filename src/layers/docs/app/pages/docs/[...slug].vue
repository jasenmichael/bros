<script setup lang="ts">
const route = useRoute()
const { data: page } = await useAsyncData(route.path, () =>
  queryCollection('content').path(route.path).first(),
)
</script>

<template>
  <BrosPageShell :title="page?.title || 'Docs'" :description="page?.description">
    <ContentRenderer v-if="page" :value="page" class="prose prose-invert max-w-none" />
    <p v-else class="text-[var(--bros-muted)]">Page not found.</p>
  </BrosPageShell>
</template>
