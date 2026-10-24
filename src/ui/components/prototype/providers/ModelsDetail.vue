<script setup lang="ts">
import type { ModelGroup } from './groups'

const props = defineProps<{ groups: ModelGroup[]; selected: string }>()
const emit = defineEmits<{ select: [name: string] }>()

const picked = computed(() => props.groups.find(g => g.name === props.selected))
</script>

<template>
  <p v-if="!groups.length" class="text-sm text-[var(--bros-muted)]">No models yet.</p>
  <div v-else class="grid gap-4 md:grid-cols-[16rem_1fr]">
    <ul class="max-h-96 divide-y divide-[var(--bros-border)] overflow-auto rounded-xl border border-[var(--bros-border)]">
      <li v-for="g in groups" :key="g.name">
        <button
          type="button"
          class="w-full px-4 py-3 text-left font-mono text-sm"
          :class="g.name === selected ? 'bg-[var(--bros-bg)] text-white' : 'text-[var(--bros-muted)]'"
          :aria-pressed="g.name === selected"
          @click="emit('select', g.name)"
        >
          {{ g.name }}
        </button>
      </li>
    </ul>
    <ul class="divide-y divide-[var(--bros-border)] rounded-xl border border-[var(--bros-border)]">
      <li v-if="!picked" class="px-4 py-3 text-sm text-[var(--bros-muted)]">Pick a model.</li>
      <li v-for="p in picked?.providers || []" :key="p.id" class="flex items-baseline justify-between gap-3 px-4 py-3">
        <span class="text-sm text-white">{{ p.name }}</span>
        <span v-if="p.sizeLabel" class="text-xs text-[var(--bros-muted)]">{{ p.sizeLabel }}</span>
      </li>
    </ul>
  </div>
</template>
