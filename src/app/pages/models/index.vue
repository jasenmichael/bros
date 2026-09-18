<script setup lang="ts">
useSeoMeta({ title: 'Models' })

const ADD_ID = '__new__'

type Provider = {
  id: string
  name: string
  kind: string
  baseUrl: string | null
  enabled: boolean
  hasApiKey: boolean
  config: Record<string, unknown>
  status?: 'running' | 'stopped' | 'error'
  statusMessage?: string | null
  port?: number | null
  popular?: boolean
}

type OllamaModel = { id: string; name: string; size?: number }

const { data, refresh, pending } = await useFetch<{
  providers: Provider[]
  ollamaModelsByProvider: Record<string, OllamaModel[]>
  openaiModelsByProvider: Record<string, string[]>
  ollamaError: string | null
  hostOllamaError?: string | null
  sidecarPublish?: number
  sidecarDns?: string
  hostOllama?: { port: number; version: string } | null
  hostProbePort?: number | null
}>('/api/models')

const selectedId = ref<string>('ollama')
const pullName = ref<string | { label: string; value: string } | undefined>('')
const busy = ref(false)
const err = ref('')
const useGpu = ref(false)
const hostPortDraft = ref('')

type PullProgress = {
  active: boolean
  model: string
  status: string
  percent: number | null
  completed: number
  total: number
}
const pullProgress = ref<PullProgress>({
  active: false,
  model: '',
  status: '',
  percent: null,
  completed: 0,
  total: 0,
})

type CatalogModel = { name: string; label: string; source: string; sizeBytes?: number }
type LibraryResponse = {
  gpu: { available: boolean; name?: string; vramMb?: number }
  disk: { path: string; freeBytes: number | null; totalBytes: number | null }
  useGpu: boolean
  sections: {
    recommended: CatalogModel[]
    ollama: CatalogModel[]
    huggingface: CatalogModel[]
    custom?: CatalogModel[]
  }
}

const libraryProviderId = computed(() => (
  selectedId.value === 'ollama-host' ? 'ollama-host' : 'ollama'
))

const { data: libraryData, pending: libraryPending, refresh: refreshLibrary } = await useFetch<LibraryResponse>('/api/models/ollama/library', {
  key: 'ollama-library',
  query: computed(() => ({ providerId: libraryProviderId.value })),
  watch: [libraryProviderId],
  lazy: true,
  default: () => ({
    gpu: { available: false },
    disk: { path: '/data', freeBytes: null, totalBytes: null },
    useGpu: false,
    sections: { recommended: [], ollama: [], huggingface: [], custom: [] },
  }),
})

watchEffect(() => {
  useGpu.value = Boolean(libraryData.value?.useGpu)
})

const listedProviders = computed(() => {
  const rows = data.value?.providers || []
  const sidecar = rows.filter((p) => p.id === 'ollama')
  const host = rows.filter((p) => p.id === 'ollama-host')
  const popular = rows.filter((p) => p.popular)
  const rest = rows.filter((p) => p.id !== 'ollama' && p.id !== 'ollama-host' && !p.popular)
  return [...sidecar, ...host, ...popular, ...rest]
})

const ollamaProviders = computed(() =>
  listedProviders.value.filter((p) => p.id === 'ollama' || p.id === 'ollama-host'),
)

const popularProviders = computed(() =>
  listedProviders.value.filter((p) => p.popular),
)

const customProviders = computed(() =>
  listedProviders.value.filter((p) => p.id !== 'ollama' && p.id !== 'ollama-host' && !p.popular),
)

const selected = computed(() =>
  ollamaProviders.value.find((p) => p.id === selectedId.value) || ollamaProviders.value[0] || null,
)

const panelOpen = ref(true)

function selectOllama(id: string) {
  if (selectedId.value === id) {
    panelOpen.value = !panelOpen.value
    return
  }
  selectedId.value = id
  panelOpen.value = true
}

const settingsTarget = ref<string | null>(null)
const settingsOpen = computed({
  get: () => settingsTarget.value != null,
  set: (open: boolean) => {
    if (!open) settingsTarget.value = null
  },
})

const settingsProvider = computed(() => {
  const id = settingsTarget.value
  if (!id || id === ADD_ID) return null
  return listedProviders.value.find((p) => p.id === id) || null
})

const isAdd = computed(() => settingsTarget.value === ADD_ID)
const isSidecarSettings = computed(() => settingsTarget.value === 'ollama')
const isHostSettings = computed(() => settingsTarget.value === 'ollama-host')
const isCustomSettings = computed(() => Boolean(settingsProvider.value) && settingsProvider.value?.kind !== 'ollama' && !settingsProvider.value?.popular)
const isPopularSettings = computed(() => Boolean(settingsProvider.value?.popular))
const settingsTitle = computed(() => {
  if (isAdd.value) return 'Add custom provider'
  return settingsProvider.value?.name || 'Provider settings'
})

const isHost = computed(() => selected.value?.id === 'ollama-host')
const ollamaRunning = computed(() => selected.value?.status === 'running')

const installedModels = computed(() => {
  const id = selected.value?.id
  if (!id) return []
  return data.value?.ollamaModelsByProvider?.[id] || []
})

const installedNames = computed(() => new Set(installedModels.value.map((m) => m.name)))
const skipDiskFit = computed(() => isHost.value)
const freeBytes = computed(() => libraryData.value?.disk?.freeBytes ?? null)
const DISK_MARGIN = 5 * 1024 ** 3

function formatSize(n?: number | null) {
  if (n == null || n <= 0 || !Number.isFinite(n)) return undefined
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`
  return `${n} B`
}

function fitsDisk(sizeBytes?: number) {
  if (skipDiskFit.value) return true
  const free = freeBytes.value
  if (free == null) return true
  if (sizeBytes == null || sizeBytes <= 0) return true
  return sizeBytes + DISK_MARGIN <= free
}

function toMenuItems(models: CatalogModel[]) {
  const installed = installedNames.value
  return models
    .filter((m) => !installed.has(m.name))
    .map((m) => {
      const sizeLabel = formatSize(m.sizeBytes)
      const ok = fitsDisk(m.sizeBytes)
      const parts = [m.label]
      if (sizeLabel) parts.push(sizeLabel)
      if (!ok) parts.push('not enough disk')
      return {
        label: parts.join(' · '),
        value: m.name,
        disabled: !ok,
        description: !ok
          ? `Needs ~${formatSize((m.sizeBytes || 0) + DISK_MARGIN)}; ${formatSize(freeBytes.value)} free`
          : sizeLabel
            ? `Download ~${sizeLabel}`
            : undefined,
      }
    })
}

const pullItems = computed(() => {
  const s = libraryData.value?.sections
  if (!s) return []
  const custom = s.custom?.length
    ? [[{ type: 'label' as const, label: 'Yours' }, ...toMenuItems(s.custom)]]
    : []
  return [
    [{ type: 'label' as const, label: 'Recommended' }, ...toMenuItems(s.recommended)],
    [{ type: 'label' as const, label: 'Ollama' }, ...toMenuItems(s.ollama)],
    [{ type: 'label' as const, label: 'Hugging Face (GGUF)' }, ...toMenuItems(s.huggingface)],
    ...custom,
  ]
})

const pullModelName = computed(() => {
  const v = pullName.value
  if (!v) return ''
  if (typeof v === 'string') return v.trim()
  return String(v.value || v.label || '').trim()
})

const selectedTooBig = computed(() => {
  if (skipDiskFit.value) return false
  const name = pullModelName.value
  if (!name) return false
  const s = libraryData.value?.sections
  if (!s) return false
  const hit = [...s.recommended, ...s.ollama, ...s.huggingface, ...(s.custom || [])].find((m) => m.name === name)
  return hit ? !fitsDisk(hit.sizeBytes) : false
})

const gpu = computed(() => libraryData.value?.gpu)
const diskLabel = computed(() => {
  const d = libraryData.value?.disk
  if (!d?.freeBytes) return null
  return `${formatSize(d.freeBytes)} free`
})

const customForm = reactive({
  id: '',
  name: '',
  baseUrl: '',
  apiKey: '',
  models: '',
})

watch(() => data.value?.providers, (rows) => {
  if (rows && !rows.some((p) => p.id === selectedId.value)) {
    selectedId.value = 'ollama'
    panelOpen.value = true
  }
})

function fillCustomForm(p: Provider | null) {
  if (!p) {
    customForm.id = ''
    customForm.name = ''
    customForm.baseUrl = ''
    customForm.apiKey = ''
    customForm.models = ''
    return
  }
  customForm.id = p.id
  customForm.name = p.name
  customForm.baseUrl = p.baseUrl || ''
  customForm.apiKey = ''
  const models = Array.isArray(p.config?.models)
    ? p.config.models.filter((n): n is string => typeof n === 'string')
    : []
  customForm.models = models.join('\n')
}

function openSettings(id: string) {
  settingsTarget.value = id
  if (id === 'ollama-host') {
    hostPortDraft.value = data.value?.hostProbePort ? String(data.value.hostProbePort) : ''
  }
  if (id === ADD_ID) {
    fillCustomForm(null)
    return
  }
  const p = listedProviders.value.find((row) => row.id === id)
  if (p && p.kind !== 'ollama') fillCustomForm(p)
}

function openAddCustom() {
  openSettings(ADD_ID)
}

function closeSettings() {
  settingsTarget.value = null
}

function statusLabel(p: Provider) {
  if (p.status === 'running') return 'running'
  if (p.status === 'error') return 'error'
  return 'stopped'
}

function hostPortFromUrl(raw: string | null | undefined) {
  if (!raw?.trim()) return null
  try {
    const u = new URL(raw)
    if (!u.hostname) return null
    const port = u.port || (u.protocol === 'https:' ? '443' : u.protocol === 'http:' ? '80' : '')
    return port ? `${u.hostname}:${port}` : u.hostname
  }
  catch {
    return null
  }
}

function endpointLabel(p: Provider) {
  if (p.id === 'ollama') {
    return `127.0.0.1:${data.value?.sidecarPublish || p.port || 11435}`
  }
  if (p.id === 'ollama-host') {
    const port = p.port || data.value?.hostOllama?.port || data.value?.hostProbePort || 11434
    return `127.0.0.1:${port}`
  }
  return hostPortFromUrl(p.baseUrl)
}

function endpointUrl(p: Provider) {
  if (p.id === 'ollama') {
    return `http://127.0.0.1:${data.value?.sidecarPublish || p.port || 11435}/`
  }
  if (p.id === 'ollama-host') {
    const port = p.port || data.value?.hostOllama?.port || data.value?.hostProbePort || 11434
    return `http://127.0.0.1:${port}/`
  }
  if (!p.baseUrl?.trim()) return null
  try {
    const u = new URL(p.baseUrl)
    if (!u.hostname) return null
    const host = u.port ? `${u.hostname}:${u.port}` : u.hostname
    return `${u.protocol}//${host}/`
  }
  catch {
    return null
  }
}

const copiedUrl = ref('')

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    copiedUrl.value = url
    window.setTimeout(() => {
      if (copiedUrl.value === url) copiedUrl.value = ''
    }, 1500)
  }
  catch {
    copiedUrl.value = ''
  }
}

async function pullModel() {
  const name = pullModelName.value
  const providerId = selected.value?.id
  if (!name || !providerId) return
  busy.value = true
  err.value = ''
  pullProgress.value = {
    active: true,
    model: name,
    status: 'Starting…',
    percent: null,
    completed: 0,
    total: 0,
  }
  try {
    const res = await fetch('/api/models/ollama/pull', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: name, providerId }),
    })
    if (!res.ok) {
      let message = `Pull failed (${res.status})`
      try {
        const body = await res.json() as { statusMessage?: string; message?: string }
        message = body.statusMessage || body.message || message
      } catch {
        // keep default
      }
      throw new Error(message)
    }
    if (!res.body) throw new Error('No pull stream')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let failed = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let evt: { status?: string; total?: number; completed?: number; error?: string }
        try {
          evt = JSON.parse(trimmed)
        } catch {
          continue
        }
        if (evt.error) {
          failed = true
          err.value = evt.error
          pullProgress.value = { ...pullProgress.value, status: evt.error, active: true }
          break
        }
        const total = Number(evt.total) || 0
        const completed = Number(evt.completed) || 0
        const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : null
        pullProgress.value = {
          active: true,
          model: name,
          status: evt.status || pullProgress.value.status || 'Pulling…',
          percent,
          completed,
          total,
        }
      }
      if (failed) break
    }
    if (!failed) {
      pullName.value = ''
      pullProgress.value = {
        ...pullProgress.value,
        status: 'Done',
        percent: 100,
        active: true,
      }
      await refresh()
      await refreshLibrary()
    }
  } catch (e: unknown) {
    err.value = e instanceof Error ? e.message : 'Pull failed'
  } finally {
    busy.value = false
    if (!err.value) {
      window.setTimeout(() => {
        pullProgress.value = { ...pullProgress.value, active: false }
      }, 1200)
    } else {
      pullProgress.value = { ...pullProgress.value, active: false }
    }
  }
}

async function setUseGpu(next: boolean) {
  busy.value = true
  err.value = ''
  try {
    await $fetch('/api/models/ollama/gpu', { method: 'POST', body: { useGpu: next, restart: true } })
    useGpu.value = next
    await refreshLibrary()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'GPU update failed'
    useGpu.value = Boolean(libraryData.value?.useGpu)
  } finally {
    busy.value = false
  }
}

function onCreatePull(item: string) {
  pullName.value = item
}

async function removeModel(name: string) {
  const providerId = selected.value?.id
  if (!providerId) return
  busy.value = true
  try {
    await $fetch('/api/models/ollama/delete', { method: 'POST', body: { model: name, providerId } })
    await refresh()
  } finally {
    busy.value = false
  }
}

function parseModelNames(raw: string) {
  return [...new Set(raw.split(/[\n,]+/).map((n) => n.trim()).filter(Boolean))]
}

async function saveCustom() {
  if (!customForm.id || !customForm.name) return
  const id = customForm.id.trim()
  if (isAdd.value && (listedProviders.value.some((p) => p.id === id) || id === 'ollama' || id === 'ollama-host')) {
    err.value = 'id is reserved'
    return
  }
  busy.value = true
  err.value = ''
  try {
    const body: Record<string, unknown> = {
      id: customForm.id.trim(),
      name: customForm.name.trim(),
      kind: 'openai',
      baseUrl: customForm.baseUrl.trim() || null,
      config: { models: parseModelNames(customForm.models) },
    }
    if (customForm.apiKey.trim()) body.apiKey = customForm.apiKey.trim()
    await $fetch('/api/models/providers', { method: 'POST', body })
    customForm.apiKey = ''
    closeSettings()
    await refresh()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Save failed'
  } finally {
    busy.value = false
  }
}

async function removeProvider(id: string) {
  busy.value = true
  err.value = ''
  try {
    await $fetch(`/api/models/providers/${id}`, { method: 'DELETE' })
    selectedId.value = 'ollama'
    closeSettings()
    await refresh()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Delete failed'
  } finally {
    busy.value = false
  }
}

async function saveHostPort() {
  busy.value = true
  err.value = ''
  try {
    const raw = hostPortDraft.value.trim()
    const n = raw ? Number(raw) : null
    const port = n && n > 0 ? n : null
    await $fetch('/api/sidecars/ollama/settings', {
      method: 'PATCH',
      body: { hostProbePort: port },
    })
    await $fetch('/api/models/providers', {
      method: 'POST',
      body: {
        id: 'ollama-host',
        name: settingsProvider.value?.name || selected.value?.name || 'Ollama host',
        kind: 'ollama',
        baseUrl: `http://host.docker.internal:${port || 11434}`,
      },
    })
    closeSettings()
    await refresh()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Port update failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BrosPageShell class="w-full" title="Models" description="Ollama sidecar, host Ollama, popular services, and custom OpenAI-compatible providers.">
    <p v-if="err" class="mb-4 text-sm text-red-400">{{ err }}</p>
    <div v-if="pending" class="text-[var(--bros-muted)]">Loading…</div>

    <section class="mb-8 w-full space-y-3">
      <h2 class="text-xl font-medium text-white">Ollama</h2>
      <ul class="w-full divide-y divide-[var(--bros-border)] rounded-xl border border-[var(--bros-border)]">
        <li
          v-for="p in ollamaProviders"
          :key="p.id"
          class="w-full"
          :class="selectedId === p.id ? 'bg-[var(--bros-bg)]/70' : ''"
          @click="selectOllama(p.id)"
        >
          <div class="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3">
            <div>
              <div class="flex items-center text-white">
                <span>{{ p.name }}</span>
                <span v-if="endpointLabel(p)" class="ml-3 inline-flex items-center gap-1.5">
                  <span class="font-mono text-xs text-[var(--bros-muted)]">{{ endpointLabel(p) }}</span>
                  <UButton
                    :icon="copiedUrl === endpointUrl(p) ? 'i-lucide-check' : 'i-lucide-copy'"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="copiedUrl === endpointUrl(p) ? 'Copied' : `Copy ${endpointUrl(p)}`"
                    @click.stop="copyUrl(endpointUrl(p)!)"
                  />
                  <UButton
                    icon="i-lucide-external-link"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :href="endpointUrl(p) || undefined"
                    target="_blank"
                    rel="noreferrer"
                    :aria-label="`Open ${endpointUrl(p)}`"
                    @click.stop
                  />
                </span>
              </div>
              <div class="text-xs text-[var(--bros-muted)]">{{ p.kind }}</div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <div class="text-right text-xs" :class="p.status === 'running' ? 'text-emerald-300' : p.status === 'error' ? 'text-amber-300' : 'text-[var(--bros-muted)]'">
                {{ statusLabel(p) }}
              </div>
              <UButton
                :icon="selectedId === p.id && panelOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="selectedId === p.id && panelOpen ? 'Collapse models' : 'Expand models'"
                :aria-expanded="selectedId === p.id && panelOpen"
                @click.stop="selectOllama(p.id)"
              />
              <UButton
                icon="i-lucide-settings"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="`Settings for ${p.name}`"
                @click.stop="openSettings(p.id)"
              />
            </div>
          </div>
          <div
            v-if="selectedId === p.id && panelOpen"
            class="w-full min-w-0 space-y-4 border-t border-[var(--bros-border)] px-4 py-3"
            @click.stop
          >
            <template v-if="p.id === 'ollama-host'">
              <p v-if="!ollamaRunning" class="text-sm text-[var(--bros-muted)]">
                {{ selected?.statusMessage || 'Host Ollama is stopped. Pull and Chat need the host daemon.' }}
              </p>
              <p class="text-xs text-amber-200">
                Pull and chat use the host Ollama disk, not $BROS_HOME/data/ollama.
              </p>
            </template>
            <div class="flex w-full min-w-0 gap-2" :class="!ollamaRunning && isHost ? 'opacity-50' : ''">
              <UInputMenu
                v-model="pullName"
                value-key="value"
                :items="pullItems"
                :loading="libraryPending"
                :disabled="Boolean(isHost && !ollamaRunning)"
                create-item
                open-on-focus
                :filter-fields="['label', 'value']"
                placeholder="Search Recommended / Ollama / Hugging Face"
                class="min-w-0 flex-1"
                :ui="{ content: 'min-w-0 w-full max-w-none' }"
                @create="onCreatePull"
              >
                <template #create-item-label="{ item }">
                  Pull custom “{{ item }}”
                </template>
                <template #item-label="{ item }">
                  <span :class="item.disabled ? 'text-[var(--bros-muted)] line-through' : ''">{{ item.label }}</span>
                </template>
              </UInputMenu>
              <UButton
                :loading="busy"
                :disabled="!pullModelName || selectedTooBig || Boolean(isHost && !ollamaRunning)"
                @click="pullModel"
              >
                Pull
              </UButton>
            </div>
            <p v-if="selectedTooBig" class="text-sm text-amber-400">
              Not enough disk for this model. Free space or pick a smaller one.
            </p>
            <div
              v-if="pullProgress.active || pullProgress.status === 'Done'"
              class="space-y-2 rounded-lg border border-[var(--bros-border)] bg-[var(--bros-bg)]/50 px-3 py-3"
            >
              <div class="flex items-center justify-between gap-2 text-sm">
                <span class="truncate text-white">{{ pullProgress.model }}</span>
                <span class="shrink-0 text-xs text-[var(--bros-muted)]">
                  {{ pullProgress.percent != null ? `${pullProgress.percent}%` : '…' }}
                </span>
              </div>
              <UProgress
                :model-value="pullProgress.percent"
                :max="100"
                size="sm"
                :animation="pullProgress.percent == null ? 'carousel' : undefined"
              />
              <p class="text-xs text-[var(--bros-muted)]">
                {{ pullProgress.status }}
                <span v-if="pullProgress.total > 0">
                  · {{ formatSize(pullProgress.completed) }} / {{ formatSize(pullProgress.total) }}
                </span>
              </p>
            </div>
            <p class="text-xs text-[var(--bros-muted)]">
              Sizes are on-disk download estimates. Tags must exist on ollama.com (official
              <span class="font-mono">library/name</span> or <span class="font-mono">user/name:tag</span>).
              Recommended stays ≤ 16 GB. HF GGUF: <span class="font-mono">hf.co/user/repo:Q4_K_M</span>.
              Oversized entries are disabled.
            </p>
            <ul class="w-full divide-y divide-[var(--bros-border)] rounded-xl border border-[var(--bros-border)]">
              <li v-for="m in installedModels" :key="m.id" class="flex items-center justify-between gap-3 px-4 py-3">
                <div class="min-w-0">
                  <div class="truncate font-mono text-sm text-white">{{ m.id }}</div>
                  <div v-if="m.size" class="text-xs text-[var(--bros-muted)]">{{ Math.round(m.size / 1e6) }} MB</div>
                </div>
                <UButton size="xs" color="error" variant="ghost" @click="removeModel(m.name)">Delete</UButton>
              </li>
              <li v-if="!installedModels.length" class="px-4 py-3 text-sm text-[var(--bros-muted)]">
                {{ selected?.statusMessage && !ollamaRunning ? 'Could not list models.' : 'No models yet — pull one above (e.g. llama3.2).' }}
              </li>
            </ul>
          </div>
        </li>
        <li v-if="!ollamaProviders.length" class="px-4 py-3 text-sm text-[var(--bros-muted)]">
          No Ollama providers yet.
        </li>
      </ul>
    </section>

    <section class="mb-8 w-full space-y-3">
      <h2 class="text-xl font-medium text-white">Popular services</h2>
      <ul class="w-full divide-y divide-[var(--bros-border)] rounded-xl border border-[var(--bros-border)]">
        <li
          v-for="p in popularProviders"
          :key="p.id"
          class="flex w-full items-center justify-between gap-3 px-4 py-3"
        >
          <div>
            <div class="flex items-center text-white">
              <span>{{ p.name }}</span>
              <span v-if="endpointLabel(p)" class="ml-3 inline-flex items-center gap-1.5">
                <span class="font-mono text-xs text-[var(--bros-muted)]">{{ endpointLabel(p) }}</span>
                <UButton
                  :icon="copiedUrl === endpointUrl(p) ? 'i-lucide-check' : 'i-lucide-copy'"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="copiedUrl === endpointUrl(p) ? 'Copied' : `Copy ${endpointUrl(p)}`"
                  @click.stop="copyUrl(endpointUrl(p)!)"
                />
                <UButton
                  icon="i-lucide-external-link"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :href="endpointUrl(p) || undefined"
                  target="_blank"
                  rel="noreferrer"
                  :aria-label="`Open ${endpointUrl(p)}`"
                  @click.stop
                />
              </span>
            </div>
            <div class="text-xs text-[var(--bros-muted)]">{{ p.statusMessage || p.kind }}</div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <div class="text-right text-xs" :class="p.status === 'running' ? 'text-emerald-300' : p.status === 'error' ? 'text-amber-300' : 'text-[var(--bros-muted)]'">
              {{ statusLabel(p) }}
            </div>
            <UButton
              icon="i-lucide-settings"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="`Settings for ${p.name}`"
              @click.stop="openSettings(p.id)"
            />
          </div>
        </li>
      </ul>
    </section>

    <section class="mb-10 w-full space-y-3">
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <h2 class="text-xl font-medium text-white">Custom providers</h2>
        <UButton size="xs" variant="outline" @click="openAddCustom">Add custom</UButton>
      </div>
      <ul class="w-full divide-y divide-[var(--bros-border)] rounded-xl border border-[var(--bros-border)]">
        <li
          v-for="p in customProviders"
          :key="p.id"
          class="flex w-full items-center justify-between gap-3 px-4 py-3"
        >
          <div>
            <div class="flex items-center text-white">
              <span>{{ p.name }}</span>
              <span v-if="endpointLabel(p)" class="ml-3 inline-flex items-center gap-1.5">
                <span class="font-mono text-xs text-[var(--bros-muted)]">{{ endpointLabel(p) }}</span>
                <UButton
                  :icon="copiedUrl === endpointUrl(p) ? 'i-lucide-check' : 'i-lucide-copy'"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="copiedUrl === endpointUrl(p) ? 'Copied' : `Copy ${endpointUrl(p)}`"
                  @click.stop="copyUrl(endpointUrl(p)!)"
                />
                <UButton
                  icon="i-lucide-external-link"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :href="endpointUrl(p) || undefined"
                  target="_blank"
                  rel="noreferrer"
                  :aria-label="`Open ${endpointUrl(p)}`"
                  @click.stop
                />
              </span>
            </div>
            <div class="text-xs text-[var(--bros-muted)]">{{ p.kind }}</div>
          </div>
          <UButton
            icon="i-lucide-settings"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Settings for ${p.name}`"
            @click.stop="openSettings(p.id)"
          />
        </li>
        <li v-if="!customProviders.length" class="px-4 py-3 text-sm text-[var(--bros-muted)]">
          No custom providers yet.
        </li>
      </ul>
    </section>

    <UModal v-model:open="settingsOpen" :title="settingsTitle" description="Provider settings">
      <template #body>
        <div class="space-y-3">
          <template v-if="isSidecarSettings">
            <div
              v-if="gpu?.available"
              class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--bros-border)] bg-[var(--bros-bg)]/50 px-3 py-2"
            >
              <div class="min-w-0 text-sm">
                <p class="text-white">GPU detected</p>
                <p class="truncate text-xs text-[var(--bros-muted)]">
                  {{ gpu.name }}{{ gpu.vramMb ? ` · ${Math.round(gpu.vramMb / 1024)} GB VRAM` : '' }}
                </p>
              </div>
              <label class="flex items-center gap-2 text-sm text-[var(--bros-muted)]">
                <USwitch
                  :model-value="useGpu"
                  :disabled="busy"
                  @update:model-value="(v: boolean) => setUseGpu(v)"
                />
                Use GPU
              </label>
            </div>
            <p v-else-if="!libraryPending" class="text-xs text-[var(--bros-muted)]">
              No NVIDIA GPU detected — recommendations favor small CPU-friendly models.
            </p>
            <p class="text-xs text-[var(--bros-muted)]">
              Sidecar publishes :{{ data?.sidecarPublish || 11435 }} (Chat uses {{ data?.sidecarDns || 'http://ollama:11434' }} on the Docker network).
            </p>
            <p v-if="data?.ollamaError" class="text-sm text-amber-400">{{ data.ollamaError }}</p>
            <p v-if="diskLabel" class="text-xs text-[var(--bros-muted)]">
              Disk: {{ diskLabel }} on <span class="font-mono">{{ libraryData?.disk?.path }}</span> (5 GB margin kept free)
            </p>
          </template>

          <template v-else-if="isHostSettings">
            <p v-if="settingsProvider?.status !== 'running'" class="text-sm text-[var(--bros-muted)]">
              {{ settingsProvider?.statusMessage || 'Host Ollama is stopped. Pull and Chat need the host daemon.' }}
            </p>
            <p class="text-xs text-amber-200">
              Pull and chat use the host Ollama disk, not $BROS_HOME/data/ollama.
            </p>
            <UInput v-model="hostPortDraft" placeholder="Host port override (optional)" />
            <p v-if="data?.hostOllama" class="text-xs text-[var(--bros-muted)]">
              Host Ollama v{{ data.hostOllama.version }} on :{{ data.hostOllama.port }}.
            </p>
            <p v-else-if="data?.hostOllamaError" class="text-xs text-amber-400">{{ data.hostOllamaError }}</p>
          </template>

          <template v-else-if="isAdd">
            <div class="grid gap-2">
              <UInput v-model="customForm.id" placeholder="id slug (e.g. my-proxy)" />
              <UInput v-model="customForm.name" placeholder="Display name" />
              <UInput v-model="customForm.baseUrl" placeholder="Base URL (OpenAI-compatible)" />
              <UInput v-model="customForm.apiKey" type="password" placeholder="API key (optional)" />
              <UTextarea v-model="customForm.models" placeholder="Model names, one per line" :rows="3" />
            </div>
          </template>

          <template v-else-if="isPopularSettings && settingsProvider">
            <div class="grid gap-2">
              <UInput :model-value="customForm.id" disabled />
              <UInput v-model="customForm.name" placeholder="Display name" />
              <p class="font-mono text-xs text-[var(--bros-muted)]">{{ customForm.baseUrl }}</p>
              <UInput v-model="customForm.apiKey" type="password" :placeholder="settingsProvider.hasApiKey ? 'API key (leave blank to keep)' : 'API key'" />
              <UTextarea v-model="customForm.models" placeholder="Model names, one per line" :rows="3" />
            </div>
          </template>
          <template v-else-if="isCustomSettings && settingsProvider">
            <div class="grid gap-2">
              <UInput :model-value="customForm.id" disabled />
              <UInput v-model="customForm.name" placeholder="Display name" />
              <UInput v-model="customForm.baseUrl" placeholder="Base URL (OpenAI-compatible)" />
              <UInput v-model="customForm.apiKey" type="password" :placeholder="settingsProvider.hasApiKey ? 'API key (leave blank to keep)' : 'API key'" />
              <UTextarea v-model="customForm.models" placeholder="Model names, one per line" :rows="3" />
            </div>
          </template>
        </div>
      </template>

      <template v-if="isHostSettings" #footer>
        <UButton :loading="busy" variant="outline" @click="saveHostPort">Save port</UButton>
      </template>
      <template v-else-if="isAdd" #footer>
        <UButton :loading="busy" :disabled="!customForm.id || !customForm.name" @click="saveCustom">
          Save provider
        </UButton>
      </template>
      <template v-else-if="isPopularSettings && settingsProvider" #footer>
        <UButton :loading="busy" :disabled="!customForm.name" @click="saveCustom">Save</UButton>
      </template>
      <template v-else-if="isCustomSettings && settingsProvider" #footer>
        <UButton :loading="busy" :disabled="!customForm.name" @click="saveCustom">Save</UButton>
        <UButton color="error" variant="ghost" :loading="busy" @click="removeProvider(settingsProvider.id)">Delete</UButton>
      </template>
    </UModal>
  </BrosPageShell>
</template>
