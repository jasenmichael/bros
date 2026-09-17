<script setup lang="ts">
useSeoMeta({ title: 'Status' })

type StatusPayload = {
  tunnelHost?: string | null
  tunnel?: {
    running: boolean
    hostname?: string | null
    publicUrl?: string | null
    installed?: boolean
    loggedIn?: boolean
    helperAlive?: boolean
    error?: string | null
  }
  app: { ok: boolean; service: string; port: number }
  docker: { ok: boolean; error?: string }
  disk: { path: string; freeBytes: number | null; totalBytes: number | null; freeLabel: string | null; totalLabel: string | null }
  gpu: { available: boolean; name?: string; vramMb?: number }
  sidecars: Array<{
    id: string
    name: string
    source: string
    error?: string
    hostPort?: number
    hostMode: string
    effectiveMode: string
    hostManaged: boolean
    portOccupied: boolean
    warning?: string
    autostart: boolean
    navPinned: boolean
    running: boolean
    services: Array<{ name: string; state: string }>
    hasContainer: boolean
    hostOllama?: { port: number; version: string } | null
    hostOllamaError?: string | null
  }>
  errors: string[]
}

const { data, pending, refresh } = await useFetch<StatusPayload>('/api/status', {
  key: 'bros-status-page',
  refreshInterval: 8000,
})
</script>

<template>
  <BrosPageShell title="Status" description="Live health for the Bros app, Docker, disk, GPU, host tunnel, and sidecars.">
    <div class="mb-4 flex justify-end">
      <UButton size="sm" color="neutral" variant="outline" :loading="pending" @click="() => refresh()">Refresh</UButton>
    </div>

    <div v-if="data?.errors?.length" class="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      <p v-for="(err, i) in data.errors" :key="i">{{ err }}</p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <article class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
        <h2 class="text-lg font-medium text-white">Bros app</h2>
        <p class="mt-2 text-sm text-[var(--bros-muted)]">
          {{ data?.app.ok ? `Up · ${data.app.service} · host port ${data.app.port}` : 'Unknown' }}
        </p>
      </article>
      <article class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
        <h2 class="text-lg font-medium text-white">Docker</h2>
        <p class="mt-2 text-sm" :class="data?.docker.ok ? 'text-[var(--bros-muted)]' : 'text-red-400'">
          {{ data?.docker.ok ? 'Socket reachable' : (data?.docker.error || 'Unreachable') }}
        </p>
      </article>
      <article class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
        <h2 class="text-lg font-medium text-white">Disk</h2>
        <p class="mt-2 font-mono text-sm text-white">{{ data?.disk.path }}</p>
        <p class="mt-1 text-sm text-[var(--bros-muted)]">
          {{ data?.disk.freeLabel || 'unknown' }} free
          <span v-if="data?.disk.totalLabel"> / {{ data.disk.totalLabel }}</span>
        </p>
      </article>
      <article class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
        <h2 class="text-lg font-medium text-white">GPU</h2>
        <p class="mt-2 text-sm text-[var(--bros-muted)]">
          <template v-if="data?.gpu.available">
            {{ data.gpu.name || 'NVIDIA GPU' }}
            <span v-if="data.gpu.vramMb"> · {{ data.gpu.vramMb }} MB</span>
          </template>
          <template v-else>None detected</template>
        </p>
      </article>
      <article class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
        <h2 class="text-lg font-medium text-white">Tunnel</h2>
        <p class="mt-2 text-sm text-[var(--bros-muted)]">Host cloudflared (not a sidecar)</p>
        <p class="mt-1 text-sm text-white">
          {{ data?.tunnel?.running ? 'running' : 'stopped' }}
          <span v-if="data?.tunnel?.publicUrl || data?.tunnel?.hostname || data?.tunnelHost"> · {{ data.tunnel?.publicUrl || data.tunnel?.hostname || data.tunnelHost }}</span>
        </p>
        <p class="mt-1 text-xs text-[var(--bros-muted)]">
          helper {{ data?.tunnel?.helperAlive ? 'up' : 'down' }}
          · installed {{ data?.tunnel?.installed ? 'yes' : 'no' }}
          · login {{ data?.tunnel?.loggedIn ? 'yes' : 'no' }}
        </p>
        <p v-if="data?.tunnel?.error" class="mt-1 text-xs text-amber-300">{{ data.tunnel.error }}</p>
      </article>
    </div>

    <h2 class="mt-8 mb-3 text-lg font-medium text-white">Sidecars</h2>
    <div class="overflow-x-auto rounded-xl border border-[var(--bros-border)]">
      <table class="min-w-full text-left text-sm">
        <thead class="bg-[#121820] text-[var(--bros-muted)]">
          <tr>
            <th class="px-3 py-2 font-medium">Name</th>
            <th class="px-3 py-2 font-medium">Mode</th>
            <th class="px-3 py-2 font-medium">Port</th>
            <th class="px-3 py-2 font-medium">State</th>
            <th class="px-3 py-2 font-medium">Autostart</th>
            <th class="px-3 py-2 font-medium">Pin</th>
            <th class="px-3 py-2 font-medium">Error</th>
            <th class="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in (data?.sidecars || []).filter((row) => row.id !== 'cloudflared')" :key="row.id" class="border-t border-[var(--bros-border)]">
            <td class="px-3 py-2 text-white">{{ row.name }}</td>
            <td class="px-3 py-2 text-[var(--bros-muted)]">
              {{ row.hostMode }}{{ row.effectiveMode !== row.hostMode ? ` (${row.effectiveMode})` : '' }}
            </td>
            <td class="px-3 py-2 font-mono text-[var(--bros-muted)]">
              {{ row.hostPort ?? '—' }}
              <span v-if="row.id === 'ollama' && row.hostOllama"> · host :{{ row.hostOllama.port }}</span>
            </td>
            <td class="px-3 py-2">
              <UBadge :color="row.running ? 'success' : 'neutral'" variant="subtle">
                {{ row.running ? 'running' : 'stopped' }}
              </UBadge>
            </td>
            <td class="px-3 py-2 text-[var(--bros-muted)]">{{ row.autostart ? 'on' : 'off' }}</td>
            <td class="px-3 py-2 text-[var(--bros-muted)]">{{ row.navPinned ? 'on' : 'off' }}</td>
            <td class="px-3 py-2 text-amber-300">{{ row.error || row.warning || '—' }}</td>
            <td class="px-3 py-2">
              <UButton
                v-if="row.hasContainer"
                :to="`/sidecars/${row.id}/logs`"
                size="xs"
                color="neutral"
                variant="soft"
              >Logs</UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </BrosPageShell>
</template>
