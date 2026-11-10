<script setup lang="ts">
import { docsLinkHref } from '../../utils/docsLinkHref'

const route = useRoute()

if (route.path.endsWith('.md')) {
  await navigateTo(docsLinkHref(route.fullPath), { redirectCode: 301 })
}

const { data: page } = await useAsyncData(route.path, () =>
  queryCollection('content').path(route.path).first(),
)

useSeoMeta({
  title: () => page.value?.title || 'Docs',
  description: () => page.value?.description || undefined,
})
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
