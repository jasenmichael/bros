<script setup lang="ts">
const route = useRoute()
const id = computed(() => String(route.params.id || ''))

useSeoMeta({ title: computed(() => `Logs · ${id.value}`) })

const { data, pending, refresh } = await useFetch<{ id: string; project: string; logs: string; error?: string }>(
  () => `/api/sidecars/${id.value}/logs`,
  { query: { tail: 200 } },
)
</script>

<template>
  <BrosPageShell :title="`Logs · ${id}`" :description="data?.project || 'Compose project logs'">
    <div class="mb-4 flex flex-wrap gap-2">
      <UButton to="/status" size="sm" color="neutral" variant="outline">Status</UButton>
      <UButton to="/sidecars" size="sm" color="neutral" variant="outline">Sidecars</UButton>
      <UButton size="sm" color="neutral" variant="soft" :loading="pending" @click="() => refresh()">Refresh</UButton>
    </div>
    <p v-if="data?.error" class="mb-3 text-sm text-red-400">{{ data.error }}</p>
    <pre class="max-h-[70vh] overflow-auto rounded-xl border border-[var(--bros-border)] bg-[#0b1016] p-4 text-xs text-[#d5deea]">{{ data?.logs || (pending ? 'Loading…' : 'No logs.') }}</pre>
  </BrosPageShell>
</template>
