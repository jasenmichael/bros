<script setup lang="ts">
const props = defineProps<{
  loading: boolean
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
  } | null
}>()

const emit = defineEmits<{ refresh: [] }>()

const tunnelRunning = computed(() => Boolean(props.tunnel?.running))
const tunnelLocked = computed(() => Boolean(props.viaTunnel && tunnelRunning.value))
const tunnelState = computed(() => (tunnelRunning.value ? 'running' : 'stopped'))

const tunnelLink = computed(() => {
  const t = props.tunnel
  if (!t || !t.helperAlive || !t.installed || !t.loggedIn) return null
  const host = t.publicUrl || t.hostname || props.tunnelHost
  if (!host) return null
  return /^https?:\/\//i.test(host) ? host : `https://${host}`
})

const tunnelSnippet = computed(() => {
  const t = props.tunnel
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
    emit('refresh')
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
  <p v-if="loading" class="mt-2 text-sm text-[var(--bros-muted)]">Starting…</p>
  <template v-else>
    <div class="mt-2 flex items-start justify-between gap-3">
      <p class="text-sm text-[var(--bros-muted)]">
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
    <p v-if="tunnel?.error && tunnelLink" class="mt-2 text-xs text-amber-300">{{ tunnel.error }}</p>
    <p v-if="tunnelLocked" class="mt-2 text-xs text-amber-300">
      Stop locked: this session is through the tunnel.
    </p>
    <p v-if="tunnelNote" class="mt-2 text-xs text-amber-300">{{ tunnelNote }}</p>
    <div class="mt-3 flex flex-wrap gap-2">
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
  </template>
</template>
