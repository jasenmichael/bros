<script setup lang="ts">
import { groupBrosServices, type BrosManagedContainerView } from '~/utils/brosServiceGroups'

const props = defineProps<{
  containers: BrosManagedContainerView[]
  sidecarNames?: Record<string, string>
  showAppLink?: boolean
}>()

const groups = computed(() => groupBrosServices(props.containers || [], props.sidecarNames || {}))

function stateColor(state: string) {
  if (state === 'running') return 'success'
  if (state === 'restarting' || state === 'paused') return 'warning'
  return 'neutral'
}

function portLabel(ports: number[]) {
  return ports.map((p) => `:${p}`).join(' ')
}
</script>

<template>
  <section>
    <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--bros-muted)]">Bros services</h2>
    <p class="mb-3 text-xs text-[var(--bros-muted)]">Docker containers Bros manages — app plus every sidecar service.</p>
    <p v-if="!groups.length" class="text-sm text-[var(--bros-muted)]">No Bros-managed containers.</p>
    <div v-else class="grid gap-3 sm:grid-cols-2">
      <article
        v-for="group in groups"
        :key="group.key"
        class="rounded-lg border border-[var(--bros-border)] bg-[var(--bros-surface)]/50 p-4"
      >
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-medium text-white">{{ group.title }}</h3>
          <UBadge :color="group.runningCount === group.total && group.total > 0 ? 'success' : 'neutral'" variant="subtle">
            {{ group.runningCount }}/{{ group.total }} running
          </UBadge>
        </div>
        <ul class="mt-3 space-y-2">
          <li
            v-for="row in group.containers"
            :key="row.id"
            class="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span class="font-mono text-white">{{ row.service }}</span>
            <span class="flex flex-wrap items-center gap-2">
              <span v-if="row.ports.length" class="font-mono text-xs text-[var(--bros-muted)]">{{ portLabel(row.ports) }}</span>
              <UBadge :color="stateColor(row.state)" variant="subtle">{{ row.state }}</UBadge>
            </span>
          </li>
        </ul>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            v-if="group.sidecarId"
            :to="`/sidecars/${group.sidecarId}/logs`"
            size="xs"
            color="neutral"
            variant="ghost"
          >Logs</UButton>
          <UButton
            v-else-if="showAppLink !== false"
            to="/status"
            size="xs"
            color="neutral"
            variant="ghost"
          >Details</UButton>
        </div>
      </article>
    </div>
  </section>
</template>
