<script setup lang="ts">
defineProps<{
  loading: boolean
  sidecars?: {
    running: number
    total: number
    items: Array<{
      id: string
      name: string
      phase: 'starting' | 'running' | 'stopped' | 'error'
      openUrl: string | null
    }>
  } | null
}>()

function phaseClass(phase: string) {
  if (phase === 'running') return 'text-[var(--bros-accent-2)]'
  if (phase === 'error') return 'text-amber-300'
  if (phase === 'starting') return 'text-[var(--bros-accent)]'
  return 'text-[var(--bros-muted)]'
}
</script>

<template>
  <article class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-lg font-medium text-white">Sidecars</h2>
      <NuxtLink
        to="/sidecars"
        class="text-sm text-[var(--bros-accent)] underline-offset-2 hover:underline"
      >Sidecars</NuxtLink>
    </div>
    <p v-if="loading" class="mt-3 text-sm text-[var(--bros-muted)]">Loading…</p>
    <template v-else-if="sidecars">
      <p class="mt-2 text-sm text-[var(--bros-muted)]">
        {{ sidecars.running }}/{{ sidecars.total }} running
      </p>
      <ul class="mt-2 divide-y divide-[var(--bros-border)]">
        <li
          v-for="item in sidecars.items"
          :key="item.id"
          class="flex items-center justify-between gap-3 py-2 text-sm"
        >
          <span class="truncate text-white">{{ item.name }}</span>
          <span class="flex shrink-0 items-center gap-3">
            <a
              v-if="item.phase === 'running' && item.openUrl"
              :href="item.openUrl"
              class="text-xs text-[var(--bros-accent)] underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >Open</a>
            <span class="text-xs" :class="phaseClass(item.phase)">{{ item.phase }}</span>
          </span>
        </li>
      </ul>
    </template>
  </article>
</template>
