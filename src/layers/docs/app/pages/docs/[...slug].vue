<script setup lang="ts">
const DOC_REDIRECTS: Record<string, string> = {
  '/docs/models': '/docs/providers',
  '/docs/models-ollama': '/docs/providers/ollama',
  '/docs/models-custom': '/docs/providers/custom',
}

const route = useRoute()
const dest = DOC_REDIRECTS[route.path.replace(/\/$/, '') || route.path]
if (dest) {
  await navigateTo(dest, { redirectCode: 301, replace: true })
}

const { data: page } = await useAsyncData(route.path, () =>
  queryCollection('content').path(route.path).first(),
)
</script>

<template>
  <BrosPageShell :title="page?.title || 'Docs'" :description="page?.description">
    <template #lead>
      <BrosDocsCrumbs />
    </template>
    <ContentRenderer v-if="page" :value="page" class="bros-prose" />
    <p v-else class="text-[var(--bros-muted)]">Page not found.</p>
  </BrosPageShell>
</template>
