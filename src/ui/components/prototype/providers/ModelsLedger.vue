<script setup lang="ts">
import type { ModelGroup } from './groups'

const props = defineProps<{ groups: ModelGroup[] }>()
const q = ref('')
const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  if (!s) return props.groups
  return props.groups.filter(g => g.name.toLowerCase().includes(s))
})
</script>

<template>
  <div class="space-y-3">
    <UInput v-model="q" placeholder="Filter model names" />
    <p v-if="!groups.length" class="text-sm text-[var(--bros-muted)]">No models yet.</p>
    <p v-else-if="!shown.length" class="text-sm text-[var(--bros-muted)]">No match.</p>
    <ul v-else class="w-full divide-y divide-[var(--bros-border)] rounded-xl border border-[var(--bros-border)]">
      <li v-for="g in shown" :key="g.name" class="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3">
        <span class="font-mono text-sm text-white">{{ g.name }}</span>
        <span class="text-sm text-[var(--bros-muted)]">
          <template v-for="(p, i) in g.providers" :key="p.id">
            <span v-if="i">, </span>{{ p.name }}<span v-if="p.sizeLabel"> · {{ p.sizeLabel }}</span>
          </template>
        </span>
      </li>
    </ul>
  </div>
</template>
