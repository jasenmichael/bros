<script setup lang="ts">
defineProps<{
  loading: boolean
  providers?: {
    ready: number
    items: Array<{
      id: string
      name: string
      chatOn: boolean
      detail: string
    }>
    pulls: Array<{
      providerId: string
      model: string
      phase: 'queued' | 'running'
      percent: number | null
    }>
  } | null
}>()

function detailClass(detail: string) {
  if (detail.startsWith('running')) return 'text-[var(--bros-accent-2)]'
  if (detail.startsWith('error')) return 'text-amber-300'
  if (detail.startsWith('starting')) return 'text-[var(--bros-accent)]'
  return 'text-[var(--bros-muted)]'
}

function pullLabel(pull: { model: string; phase: 'queued' | 'running'; percent: number | null }) {
  if (pull.phase === 'queued') return `Queued ${pull.model}`
  if (pull.percent != null) return `Pulling ${pull.model} · ${Math.round(pull.percent)}%`
  return `Pulling ${pull.model}`
}
</script>

<template>
  <article class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-lg font-medium text-white">Providers</h2>
      <NuxtLink
        to="/providers"
        class="text-sm text-[var(--bros-accent)] underline-offset-2 hover:underline"
      >Providers</NuxtLink>
    </div>
    <p v-if="loading" class="mt-3 text-sm text-[var(--bros-muted)]">Loading…</p>
    <template v-else-if="providers">
      <p class="mt-2 text-sm text-[var(--bros-muted)]">
        {{ providers.ready }} on for chat
      </p>
      <ul class="mt-2 space-y-2">
        <li
          v-for="item in providers.items"
          :key="item.id"
          class="flex items-baseline justify-between gap-3 text-sm"
        >
          <span class="truncate text-white">{{ item.name }}</span>
          <span class="shrink-0 text-xs" :class="detailClass(item.detail)">{{ item.detail }}</span>
        </li>
      </ul>
      <ul v-if="providers.pulls.length" class="mt-3 space-y-1 border-t border-[var(--bros-border)] pt-3">
        <li
          v-for="pull in providers.pulls"
          :key="`${pull.providerId}:${pull.model}`"
          class="text-xs text-[var(--bros-accent)]"
        >{{ pullLabel(pull) }}</li>
      </ul>
    </template>
  </article>
</template>
