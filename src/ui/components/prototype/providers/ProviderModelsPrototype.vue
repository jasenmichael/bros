<script setup lang="ts">
// three read-only layouts of models grouped by model name on /providers, switchable via ?variant=, dev only.
import PrototypeSwitcher from '../PrototypeSwitcher.vue'
import ModelsBoard from './ModelsBoard.vue'
import ModelsDetail from './ModelsDetail.vue'
import ModelsLedger from './ModelsLedger.vue'
import { groupModels } from './groups'

const props = defineProps<{
  providers: Array<{ id: string; name: string; models?: Array<{ name: string; size?: number }> }>
}>()

const variants = [
  { id: 'ledger', label: 'Rows' },
  { id: 'detail', label: 'Split' },
  { id: 'board', label: 'Cards' },
]

const route = useRoute()
const variant = computed(() => {
  const q = String(route.query.variant || '')
  return variants.some(row => row.id === q) ? q : 'ledger'
})
const groups = computed(() => groupModels(props.providers))
const selected = ref('')

watch(groups, (list) => {
  if (!list.some(g => g.name === selected.value)) selected.value = list[0]?.name || ''
}, { immediate: true })

const stateText = computed(() => {
  const lines = groups.value.map(g => `${g.name}: ${g.providers.map(p => p.id).join(', ')}`)
  if (!lines.length) lines.push('(none)')
  if (variant.value === 'detail') lines.push(`selected: ${selected.value || '—'}`)
  return lines.join('\n')
})
</script>

<template>
  <section class="mb-10 w-full space-y-3">
    <h2 class="text-xl font-medium text-white">Models</h2>
    <p class="text-xs text-[var(--bros-muted)]">Prototype. Grouped by model name. Each name lists the Providers that returned it.</p>
    <ModelsLedger v-if="variant === 'ledger'" :groups="groups" />
    <ModelsDetail v-else-if="variant === 'detail'" :groups="groups" :selected="selected" @select="selected = $event" />
    <ModelsBoard v-else :groups="groups" />
    <pre class="overflow-auto rounded-xl border border-[var(--bros-border)] p-3 font-mono text-xs text-[var(--bros-muted)]">{{ stateText }}</pre>
    <PrototypeSwitcher :variants="variants" />
  </section>
</template>
