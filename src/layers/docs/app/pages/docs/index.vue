<script setup lang="ts">
useSeoMeta({
  title: 'Docs',
  description: 'Bros usage: install, sidecars, and bootstrap configuration.',
})

const pages = [
  { title: 'Getting started', to: '/docs/getting-started', body: './bros --dev, port 3055, BROS_DIR, Models.' },
  { title: 'Sidecars', to: '/docs/sidecars', body: 'Core Compose packages plus custom under the host data dir.' },
  { title: 'Configuration', to: '/docs/configuration', body: 'Bootstrap YAML, BROS_DIR, and $BROS_HOST_DATA_DIR binds.' },
]
</script>

<template>
  <BrosPageShell title="Documentation" description="Install, run, and configure Bros.">
    <ul class="grid gap-3 md:grid-cols-3">
      <li v-for="page in pages" :key="page.to">
        <NuxtLink
          :to="page.to"
          class="block h-full rounded-lg border border-[var(--bros-border)] bg-[#121820] p-4 no-underline hover:border-[var(--bros-accent)]"
        >
          <span class="font-semibold text-[var(--bros-accent)]">{{ page.title }}</span>
          <p class="mt-2 text-sm text-[var(--bros-muted)]">{{ page.body }}</p>
        </NuxtLink>
      </li>
    </ul>
  </BrosPageShell>
</template>
