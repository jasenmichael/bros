<script setup lang="ts">
useSeoMeta({
  title: 'Dashboard',
  description: 'Bros control plane',
})

type StatusPayload = {
  viaTunnel?: boolean
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
    running: boolean
    hostPort?: number
    effectiveMode: string
    hostManaged: boolean
    warning?: string
    error?: string
    hasContainer: boolean
  }>
}

const { data, pending, refresh } = await useFetch<StatusPayload>('/api/status', {
  key: 'bros-status-dash',
  lazy: true,
  refreshInterval: 5000,
})

const widgets = computed(() => {
  const s = data.value
  const sidecarSnippets = (s?.sidecars || []).filter((row) => row.id !== 'cloudflared').slice(0, 4).map((row) => {
    const state = row.error ? 'error' : row.hostManaged ? 'host' : row.running ? 'up' : 'stopped'
    return `${row.name}: ${state}`
  })
  return [
    {
      to: '/status',
      title: 'Bros',
      body: s ? `App up on :${s.app.port}` : 'Control plane',
    },
    {
      to: '/status',
      title: 'Docker',
      body: s ? (s.docker.ok ? 'Socket reachable' : (s.docker.error || 'Unreachable')) : 'Checking…',
    },
    {
      to: '/status',
      title: 'Disk',
      body: s?.disk.freeLabel
        ? `${s.disk.freeLabel} free${s.disk.totalLabel ? ` / ${s.disk.totalLabel}` : ''}`
        : 'Data volume',
    },
    {
      to: '/status',
      title: 'GPU',
      body: s?.gpu.available
        ? `${s.gpu.name || 'NVIDIA GPU'}${s.gpu.vramMb ? ` · ${s.gpu.vramMb} MB` : ''}`
        : 'None detected',
    },
    {
      to: '/status',
      title: 'Sidecars',
      body: sidecarSnippets.length ? sidecarSnippets.join(' · ') : 'Core + custom Compose projects',
      extra: '/sidecars',
    },
  ]
})

const tunnel = computed(() => data.value?.tunnel)
const tunnelRunning = computed(() => Boolean(tunnel.value?.running))
const tunnelLocked = computed(() => Boolean(data.value?.viaTunnel && tunnelRunning.value))
const tunnelState = computed(() => (tunnelRunning.value ? 'running' : 'stopped'))
/** Absolute URL when tunnel has a public host; otherwise null (show plain status text). */
const tunnelLink = computed(() => {
  const t = tunnel.value
  if (!t || t.error || !t.helperAlive || !t.installed || !t.loggedIn) return null
  const host = t.publicUrl || t.hostname || data.value?.tunnelHost
  if (!host) return null
  return /^https?:\/\//i.test(host) ? host : `https://${host}`
})
const tunnelSnippet = computed(() => {
  const t = tunnel.value
  if (!t) return 'host cloudflared · waiting for helper'
  const state = tunnelState.value
  if (t.error) return `${state} · ${t.error}`
  if (!t.helperAlive) return `${state} · helper not running (start with ./bros)`
  if (!t.installed) return `${state} · cloudflared not installed (run ./bros)`
  if (!t.loggedIn) return `${state} · not logged in (run cloudflared login)`
  return state
})
const tunnelToggleLabel = computed(() => {
  if (tunnelLocked.value) return 'Cannot turn tunnel off while connected through it'
  return tunnelRunning.value ? 'Turn Cloudflare tunnel off' : 'Turn Cloudflare tunnel on'
})

const tunnelBusy = ref(false)
const tunnelNote = ref('')
const logsOpen = ref(false)
const logText = ref('')
const logsPending = ref(false)
let logTimer: ReturnType<typeof setInterval> | undefined

async function loadTunnelLogs() {
  logsPending.value = true
  try {
    const res = await $fetch<{ logs: string; error?: string }>('/api/tunnel/logs', {
      query: { tail: 80 },
    })
    logText.value = res.error || res.logs || 'No logs.'
  }
  catch {
    logText.value = 'Failed to load logs.'
  }
  finally {
    logsPending.value = false
  }
}

function setLogPoll(open: boolean) {
  if (logTimer) clearInterval(logTimer)
  logTimer = undefined
  if (open) logTimer = setInterval(() => { void loadTunnelLogs() }, 4000)
}

async function toggleLogs() {
  logsOpen.value = !logsOpen.value
  if (logsOpen.value) await loadTunnelLogs()
  setLogPoll(logsOpen.value)
}

async function toggleTunnel() {
  if (tunnelLocked.value || tunnelBusy.value) return
  tunnelBusy.value = true
  tunnelNote.value = ''
  try {
    if (!tunnelRunning.value) {
      await $fetch('/api/tunnel/start', { method: 'POST' })
    }
    else {
      await $fetch('/api/tunnel/stop', { method: 'POST' })
    }
    await refresh()
  }
  catch (err: unknown) {
    const statusMessage = typeof err === 'object' && err && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    tunnelNote.value = statusMessage || (err instanceof Error ? err.message : 'Tunnel action failed')
  }
  finally {
    tunnelBusy.value = false
  }
}

onUnmounted(() => setLogPoll(false))
</script>

<template>
  <BrosPageShell
    title="Dashboard"
    description="Local AI control plane — chat, models, and Docker sidecars."
  >
    <p v-if="pending && !data" class="mb-4 text-sm text-[var(--bros-muted)]">Loading live status…</p>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="card in widgets"
        :key="card.title"
        class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5"
      >
        <h2 class="text-lg font-medium text-white">{{ card.title }}</h2>
        <p class="mt-2 text-sm text-[var(--bros-muted)]">{{ card.body }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton :to="card.to" size="xs" color="neutral" variant="soft">Details</UButton>
          <UButton
            v-if="card.title === 'Sidecars'"
            to="/sidecars"
            size="xs"
            color="primary"
            variant="soft"
          >Manage</UButton>
        </div>
      </article>

      <article class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
        <div class="flex items-start justify-between gap-3">
          <h2 class="text-lg font-medium text-white">Tunnel</h2>
          <button
            type="button"
            class="h-9 w-9 shrink-0 rounded-full border-2 transition-colors"
            :class="tunnelRunning
              ? 'border-[var(--bros-ok)] bg-[var(--bros-ok)]'
              : 'border-[var(--bros-muted)] bg-transparent'"
            :disabled="tunnelLocked || tunnelBusy"
            :aria-pressed="tunnelRunning"
            :aria-label="tunnelToggleLabel"
            :title="tunnelToggleLabel"
            @click="toggleTunnel"
          />
        </div>
        <p class="mt-2 text-sm text-[var(--bros-muted)]">
          <template v-if="tunnelLink">
            {{ tunnelState }} ·
            <a
              :href="tunnelLink"
              class="text-white underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >{{ tunnelLink }}</a>
          </template>
          <template v-else>{{ tunnelSnippet }}</template>
        </p>
        <p v-if="tunnelLocked" class="mt-2 text-xs text-amber-300">
          Stop locked: this session is through the tunnel.
        </p>
        <p v-if="tunnelNote" class="mt-2 text-xs text-amber-300">{{ tunnelNote }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton to="/status" size="xs" color="neutral" variant="soft">Details</UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            :loading="logsPending"
            @click="toggleLogs"
          >{{ logsOpen ? 'Hide logs' : 'Logs' }}</UButton>
        </div>
        <div v-if="logsOpen" class="mt-3">
          <p class="mb-1 text-[0.65rem] uppercase tracking-wide text-[var(--bros-muted)]">host cloudflared</p>
          <pre class="max-h-48 overflow-auto rounded-lg border border-[var(--bros-border)] bg-[#0b1016] p-3 font-mono text-[0.7rem] leading-5 text-[#d5deea]">{{ logText || (logsPending ? 'Loading…' : 'No logs.') }}</pre>
        </div>
      </article>
    </div>

    <section v-if="data?.sidecars?.length" class="mt-8">
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--bros-muted)]">Sidecar snippets</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <article
          v-for="row in data.sidecars.filter((row) => row.id !== 'cloudflared')"
          :key="row.id"
          class="rounded-lg border border-[var(--bros-border)] bg-[var(--bros-surface)]/50 p-4"
        >
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-medium text-white">{{ row.name }}</h3>
            <UBadge :color="row.running ? 'success' : row.hostManaged ? 'warning' : 'neutral'" variant="subtle">
              {{ row.hostManaged ? 'host' : row.running ? 'running' : 'stopped' }}
            </UBadge>
          </div>
          <p class="mt-1 text-xs text-[var(--bros-muted)]">
            {{ row.effectiveMode }}{{ row.hostPort ? ` · :${row.hostPort}` : '' }}
          </p>
          <p v-if="row.warning || row.error" class="mt-1 text-xs text-amber-300">{{ row.error || row.warning }}</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <UButton to="/status" size="xs" color="neutral" variant="ghost">Status</UButton>
            <UButton
              v-if="row.hasContainer"
              :to="`/sidecars/${row.id}/logs`"
              size="xs"
              color="neutral"
              variant="ghost"
            >Logs</UButton>
          </div>
        </article>
      </div>
    </section>
  </BrosPageShell>
</template>
