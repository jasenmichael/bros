<script setup lang="ts">
import type { ModelGroup } from './groups'

defineProps<{ groups: ModelGroup[] }>()
</script>

<template>
  <p v-if="!groups.length" class="text-sm text-[var(--bros-muted)]">No models yet.</p>
  <ul v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <li v-for="g in groups" :key="g.name" class="rounded-xl border border-[var(--bros-border)] p-4">
      <h3 class="font-mono text-sm text-white">{{ g.name }}</h3>
      <ul class="mt-3 flex flex-wrap gap-2">
        <li
          v-for="p in g.providers"
          :key="p.id"
          class="rounded-full border border-[var(--bros-border)] px-2 py-1 text-xs text-[var(--bros-muted)]"
        >
          {{ p.name }}<span v-if="p.sizeLabel"> · {{ p.sizeLabel }}</span>
        </li>
      </ul>
    </li>
  </ul>
</template>
