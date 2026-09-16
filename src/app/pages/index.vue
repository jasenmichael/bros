<script setup lang="ts">
useSeoMeta({
  title: 'Dashboard',
  description: 'Bros control plane'
})
</script>

<template>
  <BrosPageShell
    title="Dashboard"
    description="Local AI control plane — chat, models, and Docker sidecars."
  >
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="card in [
          { to: '/chat', title: 'Chat', body: 'Stream conversations against configured models.' },
          { to: '/models', title: 'Models', body: 'Manage Ollama and paid providers.' },
          { to: '/sidecars', title: 'Sidecars', body: 'Discover, start, and proxy sidecar projects.' }
        ]"
        :key="card.to"
        :to="card.to"
        class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5 transition hover:border-[var(--bros-accent)]"
      >
        <h2 class="text-lg font-medium text-white">{{ card.title }}</h2>
        <p class="mt-2 text-sm text-[var(--bros-muted)]">{{ card.body }}</p>
      </NuxtLink>
    </div>
  </BrosPageShell>
</template>
