<script setup lang="ts">
import { docsIndexGroups } from '../../utils/docsNav'

useSeoMeta({
  title: 'Docs',
  description: 'Bros usage: install, app, sidecars, models, and development.',
})

const groups = docsIndexGroups()
</script>

<template>
  <BrosPageShell title="Documentation" description="Install, run, and configure Bros.">
    <template #lead>
      <BrosDocsCrumbs />
    </template>
    <div class="space-y-8">
      <section v-for="group in groups" :key="group.title" class="space-y-3">
        <h2 class="text-lg font-medium text-white">{{ group.title }}</h2>
        <ul class="grid gap-3 md:grid-cols-3">
          <li v-for="page in group.pages" :key="page.to">
            <NuxtLink
              :to="page.to"
              class="block h-full rounded-lg border border-[var(--bros-border)] bg-[#121820] p-4 no-underline hover:border-[var(--bros-accent)]"
            >
              <span class="font-semibold text-[var(--bros-accent)]">{{ page.title }}</span>
              <p class="mt-2 text-sm text-[var(--bros-muted)]">{{ page.body }}</p>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </BrosPageShell>
</template>
