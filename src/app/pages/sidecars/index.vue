<script setup lang="ts">
useSeoMeta({ title: 'Sidecars' })

type SidecarRow = {
  id: string
  name: string
  description: string
  source: 'core' | 'custom'
  packageSlug: string
  error?: string
  interfaces: Array<{
    type: string
    slug?: string
    service: string
    targetPort?: number
    hostPort?: number
    basePath?: string
  }>
  settings: { autostart: boolean; navPinned: boolean; hostMode?: 'auto' | 'sidecar' | 'host' }
  status: { running: boolean; services: Array<{ name: string; state: string }> }
  hostPort?: number
  hostMode?: 'auto' | 'sidecar' | 'host'
  effectiveMode?: 'sidecar' | 'host'
  hostManaged?: boolean
  warning?: string
  hasContainer?: boolean
}

const { data, refresh, pending } = await useFetch<{ sidecars: SidecarRow[]; errors: string[]; viaTunnel?: boolean }>('/api/sidecars')
const busy = ref<string | null>(null)
const copiedUrl = ref('')
const actionNote = ref('')

function webuiLinks(s: SidecarRow) {
  return s.interfaces
    .filter((i) => i.type === 'webui' && i.hostPort)
    .map((i) => ({
      label: s.name,
      to: `http://127.0.0.1:${i.hostPort}/`,
      external: true,
      hostPort: i.hostPort!,
    }))
}

/** OpenAI-compatible base URLs for tools that speak /v1 (or sidecar basePath). */
function openaiEndpoints(s: SidecarRow) {
  return s.interfaces
    .filter((i) => i.type === 'openai')
    .map((i) => {
      const basePath = (i.basePath || '/v1').startsWith('/') ? (i.basePath || '/v1') : `/${i.basePath}`
      const hostPort = i.hostPort
        || s.interfaces.find((w) => w.type === 'webui' && w.service === i.service && w.hostPort)?.hostPort
      const url = hostPort
        ? `http://127.0.0.1:${hostPort}${basePath}`
        : `http://${i.service}:${i.targetPort}${basePath}`
      return { url, network: hostPort ? 'host' as const : 'bros' as const }
    })
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    copiedUrl.value = url
    setTimeout(() => {
      if (copiedUrl.value === url) copiedUrl.value = ''
    }, 1500)
  } catch {
    copiedUrl.value = ''
  }
}

async function act(id: string, action: 'start' | 'stop' | 'restart') {
  busy.value = id
  try {
    const res = await $fetch<{ warning?: string }>(`/api/sidecars/${id}/${action}`, { method: 'POST' })
    actionNote.value = res?.warning || ''
    await refresh()
  } finally {
    busy.value = null
  }
}

const { refreshPinnedNav } = usePinnedNav()

const hostModes = [
  { label: 'Auto', value: 'auto' },
  { label: 'Sidecar', value: 'sidecar' },
  { label: 'Host', value: 'host' },
]

async function patchSettings(id: string, body: { autostart?: boolean; navPinned?: boolean; hostMode?: 'auto' | 'sidecar' | 'host' }) {
  busy.value = id
  try {
    await $fetch(`/api/sidecars/${id}/settings`, { method: 'PATCH', body })
    await refresh()
    await refreshPinnedNav()
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <BrosPageShell title="Sidecars" description="Managed Compose projects outside the core stack.">
    <div v-if="data?.errors?.length" class="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      <p v-for="(err, i) in data.errors" :key="i">{{ err }}</p>
    </div>
    <div v-if="actionNote" class="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      {{ actionNote }}
    </div>

    <div v-if="pending" class="text-[var(--bros-muted)]">Loading…</div>
    <div v-else class="grid gap-4 lg:grid-cols-2">
      <article
        v-for="s in data?.sidecars || []"
        :key="s.id"
        class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-medium text-white">{{ s.name }}</h2>
            <p class="mt-1 text-sm text-[var(--bros-muted)]">{{ s.description }}</p>
          </div>
          <UBadge :color="s.status.running ? 'success' : 'error'" variant="subtle">
            {{ s.status.running ? 'running' : 'stopped' }}
          </UBadge>
        </div>

        <div class="mt-3 flex flex-wrap gap-1">
          <UBadge variant="outline">{{ s.source }}</UBadge>
          <UBadge v-for="iface in s.interfaces" :key="iface.type + iface.service" variant="soft">
            {{ iface.type }}
          </UBadge>
        </div>

        <p v-if="s.error" class="mt-3 text-sm text-red-400">{{ s.error }}</p>
        <p v-else-if="s.warning" class="mt-3 text-sm text-amber-300">{{ s.warning }}</p>
        <p v-if="s.hostManaged" class="mt-2 text-xs text-[var(--bros-muted)]">
          Host-managed ({{ s.hostMode || 'auto' }}{{ s.effectiveMode && s.effectiveMode !== s.hostMode ? `, effective ${s.effectiveMode}` : '' }}).
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            size="sm"
            color="success"
            variant="outline"
            :class="s.status.running && !s.error ? 'bg-success/10' : undefined"
            :loading="busy === s.id"
            :disabled="!!s.error"
            @click="act(s.id, 'start')"
          >Start</UButton>
          <UButton
            size="sm"
            color="error"
            variant="outline"
            :class="!s.status.running && !s.error ? 'bg-error/10' : undefined"
            :loading="busy === s.id"
            @click="act(s.id, 'stop')"
          >Stop</UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :loading="busy === s.id"
            :disabled="!!s.error"
            @click="act(s.id, 'restart')"
          >Restart</UButton>
          <UButton
            v-for="link in webuiLinks(s)"
            :key="link.to"
            size="sm"
            color="primary"
            variant="soft"
            :to="link.to"
            :target="link.external ? '_blank' : undefined"
          >
            Open {{ link.label }} (:{{ link.hostPort }})
          </UButton>
          <UButton
            v-if="s.hasContainer"
            size="sm"
            color="neutral"
            variant="ghost"
            :to="`/sidecars/${s.id}/logs`"
          >Logs</UButton>
        </div>

        <div v-if="openaiEndpoints(s).length" class="mt-4 space-y-2">
          <p class="text-xs font-medium uppercase tracking-wide text-[var(--bros-muted)]">OpenAI-compatible</p>
          <div
            v-for="ep in openaiEndpoints(s)"
            :key="ep.url"
            class="flex items-center gap-2 rounded-lg border border-[var(--bros-border)] bg-[var(--bros-bg)]/60 px-3 py-2"
          >
            <div class="min-w-0 flex-1">
              <a
                :href="ep.url"
                class="block truncate font-mono text-sm text-[var(--bros-accent)] hover:underline"
                :title="ep.url"
                @click.prevent="copyUrl(ep.url)"
              >{{ ep.url }}</a>
              <p class="text-[0.65rem] text-[var(--bros-muted)]">
                {{ ep.network === 'host' ? 'Reachable from host' : 'Bros Docker network' }}
              </p>
            </div>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              :icon="copiedUrl === ep.url ? 'i-lucide-check' : 'i-lucide-copy'"
              :aria-label="copiedUrl === ep.url ? 'Copied' : 'Copy URL'"
              @click="copyUrl(ep.url)"
            />
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <label class="flex items-center gap-2 text-[var(--bros-muted)]">
            <USwitch
              :model-value="s.settings.autostart"
              :disabled="busy === s.id"
              @update:model-value="(v: boolean) => patchSettings(s.id, { autostart: v })"
            />
            Autostart
          </label>
          <label class="flex items-center gap-2 text-[var(--bros-muted)]">
            <USwitch
              :model-value="s.settings.navPinned"
              :disabled="busy === s.id || !webuiLinks(s).length"
              @update:model-value="(v: boolean) => patchSettings(s.id, { navPinned: v })"
            />
            Pin in nav
          </label>
          <label class="flex items-center gap-2 text-[var(--bros-muted)]">
            Mode
            <select
              class="rounded-md border border-[var(--bros-border)] bg-[#0e141c] px-2 py-1 text-sm text-white"
              :value="s.settings.hostMode || 'auto'"
              :disabled="busy === s.id"
              @change="(e: Event) => patchSettings(s.id, { hostMode: (e.target as HTMLSelectElement).value as 'auto' | 'sidecar' | 'host' })"
            >
              <option v-for="opt in hostModes" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>
        </div>
      </article>
    </div>
  </BrosPageShell>
</template>
