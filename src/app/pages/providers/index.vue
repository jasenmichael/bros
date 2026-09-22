<script setup lang="ts">
import { isOllamaModelChatEnabled, parseDisabledOllamaModels } from '../../utils/ollamaDisabledModels'
import { isValidOllamaPullName, ollamaNameFromMenuValue } from '../../utils/ollamaPullName'
import { ollamaProviderDisplayName } from '../../utils/ollamaProviderLabel'

useSeoMeta({ title: 'Providers' })

const ADD_ID = '__new__'

type Provider = {
  id: string
  name: string
  kind: string
  baseUrl: string | null
  enabled: boolean
  hasApiKey: boolean
  config: Record<string, unknown>
  status?: 'ready' | 'needs_key' | 'invalid_key' | 'unreachable'
  statusLabel?: string
  statusMessage?: string | null
  port?: number | null
  popular?: boolean
  siteUrl?: string | null
  models?: Array<{ id: string; name: string; size?: number; enabled: boolean }>
}

type OllamaModel = { id: string; name: string; size?: number }
type PullJobPhase = 'queued' | 'running' | 'stopped' | 'done'
type PullJob = {
  providerId: string
  model: string
  status: string
  percent: number | null
  completed: number
  total: number
  error: string | null
  phase: PullJobPhase
  startedAt: number
}

const { data, refresh, pending } = await useFetch<{
  providers: Provider[]
  activePulls?: Record<string, PullJob[]>
  ollamaError: string | null
  hostOllamaError?: string | null
  sidecarPublish?: number
  sidecarDns?: string
  hostOllama?: { port: number; version: string } | null
  hostProbePort?: number | null
}>('/api/providers')

const selectedId = ref<string>('ollama')
const pullName = ref<string | { label: string; value: string } | undefined>('')
const pullSearch = ref('')
const pullMenuOpen = ref(false)
const pullPicked = ref(false)
const busy = ref(false)
const scanPending = ref(false)
const err = ref('')
const useGpu = ref(false)
const hostPortDraft = ref('')

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

const { data: pullJobsData, refresh: refreshPulls } = await useFetch<{
  jobs: PullJob[]
  activePulls: Record<string, PullJob[]>
}>(() => `/api/providers/${libraryProviderId.value}/models/pull`, {
  key: 'ollama-pull-jobs',
  lazy: true,
  watch: [libraryProviderId],
  default: () => ({ jobs: [], activePulls: {} }),
})

const { data: libraryData, pending: libraryPending, refresh: refreshLibrary } = await useFetch<LibraryResponse>(
  () => `/api/providers/${libraryProviderId.value}/models/library`,
  {
  key: 'ollama-library',
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

const panelOpen = ref(false)

function selectOllama(id: string) {
  if (selectedId.value === id) {
    panelOpen.value = !panelOpen.value
  }
  else {
    selectedId.value = id
    panelOpen.value = true
  }
  if (panelOpen.value && id === 'ollama-host') {
    hostPortDraft.value = data.value?.hostProbePort ? String(data.value.hostProbePort) : ''
  }
}

const popularOpenId = ref<string | null>(null)

function selectPopular(id: string) {
  if (popularOpenId.value === id) {
    popularOpenId.value = null
    return
  }
  popularOpenId.value = id
  const p = listedProviders.value.find((row) => row.id === id)
  fillCustomForm(p || null)
}

function openaiModelNames(p: Provider) {
  const live = (p.models || []).map((m) => m.name)
  if (live.length) return live
  return Array.isArray(p.config?.models)
    ? p.config.models.filter((n): n is string => typeof n === 'string')
    : []
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
const isCustomSettings = computed(() => Boolean(settingsProvider.value) && settingsProvider.value?.kind !== 'ollama' && !settingsProvider.value?.popular)
const settingsTitle = computed(() => {
  if (isAdd.value) return 'Add custom provider'
  return settingsProvider.value?.name || 'Provider settings'
})

const isHost = computed(() => selected.value?.id === 'ollama-host')
const ollamaReady = computed(() => selected.value?.status === 'ready')

const installedModels = computed(() => {
  const id = selected.value?.id
  if (!id) return []
  const p = listedProviders.value.find((row) => row.id === id)
  return (p?.models || []).map((m) => ({ id: m.id, name: m.name, size: m.size })) as OllamaModel[]
})

const activePulls = computed(() => ({
  ...(data.value?.activePulls || {}),
  ...(pullJobsData.value?.activePulls || {}),
}))

const pullsForSelected = computed(() => {
  const id = selected.value?.id
  if (!id) return []
  return activePulls.value[id] || []
})

const listedModels = computed(() => {
  const id = selected.value?.id
  if (!id) return []
  const installed = installedModels.value
  const installedNames = new Set(installed.map((m) => m.name))
  const pulls = pullsForSelected.value
  const pullByName = new Map(pulls.map((job) => [job.model, job]))
  const installedRows = installed.map((m) => {
    const pull = pullByName.get(m.name)
    return {
      ...m,
      pull: pull && pull.phase !== 'done' ? pull : undefined,
    }
  })
  const pullingRows = pulls
    .filter((job) => job.phase !== 'done' && !installedNames.has(job.model))
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((job) => ({
      id: `${job.providerId}/${job.model}`,
      name: job.model,
      pull: job,
    }))
  return [...pullingRows, ...installedRows]
})

const hasLivePull = computed(() =>
  Object.values(activePulls.value).some((jobs) => jobs.some((job) => job.phase === 'running' || job.phase === 'queued')),
)

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
  const pulling = new Set(pullsForSelected.value.map((job) => job.model))
  return models
    .filter((m) => !installed.has(m.name) && !pulling.has(m.name))
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
  const fromName = ollamaNameFromMenuValue(pullName.value)
  if (isValidOllamaPullName(fromName)) return fromName
  const fromSearch = ollamaNameFromMenuValue(pullSearch.value)
  if (isValidOllamaPullName(fromSearch)) return fromSearch
  return fromName || fromSearch
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

const canPull = computed(() => {
  if (selectedTooBig.value || Boolean(isHost.value && !ollamaReady.value)) return false
  const name = pullModelName.value
  if (!name || !isValidOllamaPullName(name)) return false
  const pulling = pullsForSelected.value.some((job) => (
    job.model === name && (job.phase === 'running' || job.phase === 'queued')
  ))
  if (pulling) return false
  return true
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
  popularOpenId.value = null
  settingsTarget.value = id
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
  if (p.statusLabel) return p.statusLabel
  if (p.status === 'ready') return 'Ready'
  if (p.status === 'needs_key') return 'Need an API key'
  if (p.status === 'invalid_key') return 'Invalid key'
  return 'Unreachable'
}

function statusColor(p: Provider) {
  if (p.status === 'ready') return 'success'
  if (p.status === 'invalid_key') return 'warning'
  return 'neutral'
}

function chatSwitchDisabled(p: Provider) {
  return busy.value || (!p.enabled && p.status !== 'ready')
}

function providerTitle(p: Provider) {
  return ollamaProviderDisplayName(p, {
    hostOllamaPort: data.value?.hostOllama?.port,
    hostProbePort: data.value?.hostProbePort,
  })
}

function chatSwitchTitle(p: Provider) {
  if (p.enabled) return `Hide ${providerTitle(p)} from Chat`
  if (p.status === 'ready') return `Show ${providerTitle(p)} in Chat`
  if (p.status === 'needs_key') return 'Save a valid API key before enabling Chat'
  return 'Chat needs a healthy endpoint'
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
    const port = p.port || data.value?.hostOllama?.port || data.value?.hostProbePort
    return port ? `127.0.0.1:${port}` : null
  }
  return hostPortFromUrl(p.baseUrl)
}

function endpointUrl(p: Provider) {
  if (p.id === 'ollama') {
    return `http://127.0.0.1:${data.value?.sidecarPublish || p.port || 11435}/`
  }
  if (p.id === 'ollama-host') {
    const port = p.port || data.value?.hostOllama?.port || data.value?.hostProbePort
    return port ? `http://127.0.0.1:${port}/` : null
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

function applyLocalJob(job: PullJob) {
  const cur = pullJobsData.value || { jobs: [], activePulls: {} }
  const jobs = [...cur.jobs.filter((row) => !(row.providerId === job.providerId && row.model === job.model)), job]
  const activePulls = { ...cur.activePulls }
  const list = (activePulls[job.providerId] || []).filter((row) => row.model !== job.model)
  list.push(job)
  activePulls[job.providerId] = list
  pullJobsData.value = { jobs, activePulls }
}

async function pullModel(nameOverride?: string) {
  const name = (nameOverride || pullModelName.value).trim()
  const providerId = selected.value?.id
  if (!name || !providerId || !isValidOllamaPullName(name)) return
  pullName.value = ''
  pullSearch.value = ''
  pullPicked.value = false
  pullMenuOpen.value = false
  err.value = ''
  try {
    const res = await $fetch<{ ok: boolean; job: PullJob }>(`/api/providers/${providerId}/models/pull`, {
      method: 'POST',
      body: { model: name },
    })
    if (res.job) applyLocalJob(res.job)
    void refreshPulls()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (e instanceof Error ? e.message : 'Pull failed')
  }
}

async function stopPull(name: string) {
  const providerId = selected.value?.id
  if (!providerId) return
  err.value = ''
  try {
    await $fetch(`/api/providers/${providerId}/models/pull/stop`, { method: 'POST', body: { model: name } })
    await refreshPulls()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Stop failed'
  }
}

function resumePull(name: string) {
  return pullModel(name)
}

function onPullSelect(value: string | { label: string; value: string } | undefined) {
  const name = ollamaNameFromMenuValue(value)
  pullName.value = name
  pullPicked.value = Boolean(name && isValidOllamaPullName(name))
  if (name) pullMenuOpen.value = false
}

function onPullSearch(term: string) {
  pullSearch.value = term
  const extracted = ollamaNameFromMenuValue(term)
  if (!term.trim()) return
  if (extracted !== term.trim()) {
    if (isValidOllamaPullName(extracted)) {
      pullName.value = extracted
      pullPicked.value = true
      pullMenuOpen.value = false
    }
    return
  }
  pullPicked.value = false
  pullName.value = term.trim()
  pullMenuOpen.value = false
}

function onPullOpen(open: boolean) {
  pullMenuOpen.value = open
}

let pullPoll: ReturnType<typeof setInterval> | null = null
function stopPullPoll() {
  if (pullPoll) {
    clearInterval(pullPoll)
    pullPoll = null
  }
}

function syncPullPoll() {
  if (hasLivePull.value) {
    if (!pullPoll) {
      pullPoll = setInterval(() => {
        void refreshPulls()
      }, 1000)
    }
  } else {
    stopPullPoll()
  }
}

onMounted(() => {
  watch(hasLivePull, syncPullPoll, { immediate: true })
})

watch(pullsForSelected, async (jobs, prev) => {
  const prevDone = new Set((prev || []).filter((j) => j.phase === 'done').map((j) => j.model))
  const newlyDone = jobs.filter((j) => j.phase === 'done' && !prevDone.has(j.model))
  if (newlyDone.length) {
    await refresh()
    await refreshLibrary()
    await refreshPulls()
  }
  const failed = jobs.find((j) => j.error && j.phase === 'stopped')
  if (failed?.error) err.value = failed.error
})

onUnmounted(() => {
  stopPullPoll()
})

async function setUseGpu(next: boolean) {
  busy.value = true
  err.value = ''
  try {
    await $fetch('/api/providers/ollama/gpu', { method: 'POST', body: { useGpu: next, restart: true } })
    useGpu.value = next
    await refreshLibrary()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'GPU update failed'
    useGpu.value = Boolean(libraryData.value?.useGpu)
  } finally {
    busy.value = false
  }
}

function disabledModelsFor(p: Provider | null): string[] {
  return parseDisabledOllamaModels(p?.config)
}

function isModelChatEnabled(p: Provider | null | undefined, name: string) {
  return isOllamaModelChatEnabled(name, disabledModelsFor(p || null))
}

async function setModelEnabled(p: Provider | null | undefined, name: string, enabled: boolean) {
  const providerId = p?.id
  if (!providerId) return
  busy.value = true
  err.value = ''
  try {
    await $fetch(`/api/providers/${providerId}/models`, {
      method: 'PATCH',
      body: { name, enabled },
    })
    await refresh()
  }
  catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Update failed'
  }
  finally {
    busy.value = false
  }
}

const deleteTarget = ref<string | null>(null)
const deleteOpen = computed({
  get: () => deleteTarget.value != null,
  set: (open: boolean) => {
    if (!open) deleteTarget.value = null
  },
})

function askDeleteModel(name: string) {
  deleteTarget.value = name
}

async function confirmDeleteModel() {
  const name = deleteTarget.value
  if (!name) return
  deleteTarget.value = null
  await removeModel(name)
}

async function removeModel(name: string) {
  const providerId = selected.value?.id
  if (!providerId) return
  busy.value = true
  try {
    await $fetch(`/api/providers/${providerId}/models`, { method: 'DELETE', body: { name } })
    await refresh()
    await refreshPulls()
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
    await $fetch('/api/providers', { method: 'POST', body })
    customForm.apiKey = ''
    if (settingsTarget.value) closeSettings()
    await refresh()
    if (popularOpenId.value) {
      const p = listedProviders.value.find((row) => row.id === popularOpenId.value)
      if (p) fillCustomForm(p)
    }
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
    await $fetch(`/api/providers/${id}`, { method: 'DELETE' })
    selectedId.value = 'ollama'
    closeSettings()
    await refresh()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Delete failed'
  } finally {
    busy.value = false
  }
}

async function setChatEnabled(p: Provider, enabled: boolean) {
  busy.value = true
  err.value = ''
  try {
    await $fetch(`/api/providers/${p.id}`, { method: 'PATCH', body: { enabled } })
    await refresh()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Update failed'
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
    await $fetch('/api/providers', {
      method: 'POST',
      body: {
        id: 'ollama-host',
        name: 'Ollama (host)',
        kind: 'ollama',
        baseUrl: `http://host.docker.internal:${port || 11434}`,
      },
    })
    await refresh()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Port update failed'
  } finally {
    busy.value = false
  }
}

async function scanHost() {
  scanPending.value = true
  err.value = ''
  try {
    await $fetch('/api/providers/ollama-host/scan', { method: 'POST' })
    await refresh()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Scan failed'
  } finally {
    scanPending.value = false
  }
}
</script>

<template>
  <BrosPageShell class="w-full" title="Providers" description="Ollama sidecar, host Ollama, popular services, and custom OpenAI-compatible providers.">
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
                <span>{{ providerTitle(p) }}</span>
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
                </span>
              </div>
              <div class="text-xs text-[var(--bros-muted)]">{{ p.kind }}</div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UBadge :color="statusColor(p)" variant="subtle" size="xs">
                {{ statusLabel(p) }}
              </UBadge>
              <label
                class="flex flex-col items-center gap-0.5 text-[10px] leading-none text-[var(--bros-muted)]"
                :title="chatSwitchTitle(p)"
                @click.stop
              >
                <span>Chat</span>
                <USwitch
                  :model-value="p.enabled"
                  :disabled="chatSwitchDisabled(p)"
                  :aria-label="`Enable ${providerTitle(p)} for chat`"
                  @update:model-value="(v: boolean) => setChatEnabled(p, v)"
                />
              </label>
              <UButton
                :icon="selectedId === p.id && panelOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="selectedId === p.id && panelOpen ? 'Collapse models' : 'Expand models'"
                :aria-expanded="selectedId === p.id && panelOpen"
                @click.stop="selectOllama(p.id)"
              />
            </div>
          </div>
          <div
            v-if="selectedId === p.id && panelOpen"
            class="w-full min-w-0 space-y-4 border-t border-[var(--bros-border)] px-4 py-3"
            @click.stop
          >
            <template v-if="p.id === 'ollama-host'">
              <p v-if="!ollamaReady" class="text-sm text-[var(--bros-muted)]">
                {{ selected?.statusMessage || 'Host Ollama is unreachable. Pull and Chat need the host daemon.' }}
              </p>
              <p class="text-xs text-amber-200">
                Pull and chat use the host Ollama disk, not $BROS_HOME/data/ollama.
              </p>
              <p class="text-xs text-[var(--bros-muted)]">
                Run the host Ollama daemon with <span class="font-mono">OLLAMA_NOPRUNE=1</span> so incomplete pulls are not pruned. Bros cannot set host daemon env.
              </p>
            </template>
            <div class="flex w-3/4 max-w-3xl min-w-0 gap-2" :class="!ollamaReady && isHost ? 'opacity-50' : ''">
              <UInputMenu
                v-model="pullName"
                v-model:open="pullMenuOpen"
                v-model:search-term="pullSearch"
                value-key="value"
                :items="pullItems"
                :loading="libraryPending"
                :disabled="Boolean(isHost && !ollamaReady)"
                label-key="value"
                :open-on-focus="!pullModelName"
                open-on-click
                :filter-fields="['label', 'value']"
                placeholder="Search Recommended / Ollama / Hugging Face"
                class="min-w-0 w-full flex-1"
                :ui="{
                  root: 'w-full',
                  base: 'w-full',
                  content: 'w-(--reka-combobox-trigger-width) min-w-(--reka-combobox-trigger-width)',
                  item: 'w-full',
                  itemWrapper: 'w-full min-w-0',
                }"
                @update:model-value="onPullSelect"
                @update:open="onPullOpen"
                @update:search-term="onPullSearch"
              >
                <template #item-label="{ item }">
                  <span :class="item.disabled ? 'text-[var(--bros-muted)] line-through' : ''">{{ item.label }}</span>
                </template>
              </UInputMenu>
              <UButton
                :disabled="!canPull"
                @click="pullModel()"
              >
                Pull
              </UButton>
            </div>
            <p v-if="selectedTooBig" class="text-sm text-amber-400">
              Not enough disk for this model. Free space or pick a smaller one.
            </p>
            <p class="text-xs text-[var(--bros-muted)]">
              Sizes are on-disk download estimates. Tags must exist on ollama.com (official
              <span class="font-mono">library/name</span> or <span class="font-mono">user/name:tag</span>).
              Recommended stays ≤ 16 GB. HF GGUF: <span class="font-mono">hf.co/user/repo:Q4_K_M</span>.
              Oversized entries are disabled.
              Ollama pulls one model at a time per provider; extra Pulls wait in this list.
            </p>
            <ul class="w-full divide-y divide-[var(--bros-border)] rounded-xl border border-[var(--bros-border)]">
              <li v-for="m in listedModels" :key="m.id" class="flex items-center justify-between gap-3 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <div class="truncate font-mono text-sm text-white">{{ m.name }}</div>
                  <div v-if="m.pull && m.pull.phase !== 'done'" class="mt-2 space-y-1">
                    <div class="flex items-center justify-between gap-2 text-xs text-[var(--bros-muted)]">
                      <span class="truncate">{{ m.pull.status }}</span>
                      <span class="shrink-0">
                        {{ m.pull.percent != null ? `${m.pull.percent}%` : '…' }}
                      </span>
                    </div>
                    <UProgress
                      :model-value="m.pull.percent"
                      :max="100"
                      size="sm"
                      :animation="m.pull.percent == null && m.pull.phase === 'running' ? 'carousel' : undefined"
                    />
                    <p v-if="m.pull.total > 0" class="text-xs text-[var(--bros-muted)]">
                      {{ formatSize(m.pull.completed) }} / {{ formatSize(m.pull.total) }}
                    </p>
                  </div>
                  <div v-else-if="m.size" class="text-xs text-[var(--bros-muted)]">{{ Math.round(m.size / 1e6) }} MB</div>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <template v-if="m.pull && m.pull.phase !== 'done'">
                    <UButton
                      v-if="m.pull.phase === 'running' || m.pull.phase === 'queued'"
                      size="xs"
                      variant="outline"
                      :aria-label="`Stop pull ${m.name}`"
                      @click="stopPull(m.name)"
                    >
                      Stop
                    </UButton>
                    <UButton
                      v-else
                      size="xs"
                      variant="outline"
                      :aria-label="`Resume pull ${m.name}`"
                      @click="resumePull(m.name)"
                    >
                      Resume
                    </UButton>
                  </template>
                  <USwitch
                    v-else
                    :model-value="isModelChatEnabled(p, m.name)"
                    :disabled="busy"
                    :aria-label="`Enable ${m.name} for chat`"
                    @update:model-value="(v: boolean) => setModelEnabled(p, m.name, v)"
                  />
                  <UButton
                    icon="i-lucide-ban"
                    color="error"
                    variant="ghost"
                    size="xs"
                    square
                    :aria-label="`Delete ${m.name}`"
                    @click="askDeleteModel(m.name)"
                  />
                </div>
              </li>
              <li v-if="!listedModels.length" class="px-4 py-3 text-sm text-[var(--bros-muted)]">
                {{ selected?.statusMessage && !ollamaReady ? 'Could not list models.' : 'No models yet — pull one above (e.g. llama3.2).' }}
              </li>
            </ul>
            <template v-if="p.id === 'ollama'">
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
            <template v-else-if="p.id === 'ollama-host'">
              <div class="flex flex-wrap items-center gap-2">
                <UButton :loading="scanPending" variant="outline" @click="scanHost">Scan</UButton>
                <p v-if="data?.hostOllama" class="text-xs text-[var(--bros-muted)]">
                  v{{ data.hostOllama.version }} on :{{ data.hostOllama.port }}
                </p>
                <p v-else-if="data?.hostOllamaError" class="text-xs text-amber-400">{{ data.hostOllamaError }}</p>
                <p v-else class="text-xs text-[var(--bros-muted)]">Host Ollama not found.</p>
              </div>
              <div class="flex w-full min-w-0 gap-2">
                <UInput v-model="hostPortDraft" placeholder="Host port override (optional)" class="min-w-0 flex-1" />
                <UButton :loading="busy" variant="outline" @click="saveHostPort">Save port</UButton>
              </div>
            </template>
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
          class="w-full"
          :class="popularOpenId === p.id ? 'bg-[var(--bros-bg)]/70' : ''"
          @click="selectPopular(p.id)"
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
                    v-if="p.siteUrl"
                    icon="i-lucide-globe"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :href="p.siteUrl"
                    target="_blank"
                    rel="noreferrer"
                    :aria-label="`Open ${p.name}`"
                    @click.stop
                  />
                </span>
              </div>
              <div class="text-xs text-[var(--bros-muted)]">{{ p.kind }}</div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UBadge :color="statusColor(p)" variant="subtle" size="xs">
                {{ statusLabel(p) }}
              </UBadge>
              <label
                class="flex flex-col items-center gap-0.5 text-[10px] leading-none text-[var(--bros-muted)]"
                :title="chatSwitchTitle(p)"
                @click.stop
              >
                <span>Chat</span>
                <USwitch
                  :model-value="p.enabled"
                  :disabled="chatSwitchDisabled(p)"
                  :aria-label="`Enable ${providerTitle(p)} for chat`"
                  @update:model-value="(v: boolean) => setChatEnabled(p, v)"
                />
              </label>
              <UButton
                :icon="popularOpenId === p.id ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="popularOpenId === p.id ? `Collapse ${p.name}` : `Expand ${p.name}`"
                :aria-expanded="popularOpenId === p.id"
                @click.stop="selectPopular(p.id)"
              />
            </div>
          </div>
          <div
            v-if="popularOpenId === p.id"
            class="w-full min-w-0 space-y-4 border-t border-[var(--bros-border)] px-4 py-3"
            @click.stop
          >
            <ul class="w-full divide-y divide-[var(--bros-border)] rounded-xl border border-[var(--bros-border)]">
              <li v-for="name in openaiModelNames(p)" :key="name" class="flex items-center justify-between gap-3 px-4 py-3">
                <div class="min-w-0">
                  <div class="truncate font-mono text-sm text-white">{{ name }}</div>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <USwitch
                    :model-value="isModelChatEnabled(p, name)"
                    :disabled="busy"
                    :aria-label="`Enable ${name} for chat`"
                    @update:model-value="(v: boolean) => setModelEnabled(p, name, v)"
                  />
                </div>
              </li>
              <li v-if="!openaiModelNames(p).length" class="px-4 py-3 text-sm text-[var(--bros-muted)]">
                No models yet — add names below or save a key to list them.
              </li>
            </ul>
            <div class="grid gap-2">
              <UInput v-model="customForm.name" placeholder="Display name" />
              <UInput v-model="customForm.apiKey" type="password" :placeholder="p.hasApiKey ? 'API key (leave blank to keep)' : 'API key'" />
              <UTextarea v-model="customForm.models" placeholder="Model names, one per line" :rows="3" />
              <div>
                <UButton :loading="busy" :disabled="!customForm.name" @click="saveCustom">Save</UButton>
              </div>
            </div>
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
          <div class="flex shrink-0 items-center gap-2">
            <UBadge :color="statusColor(p)" variant="subtle" size="xs">
              {{ statusLabel(p) }}
            </UBadge>
            <label
              class="flex flex-col items-center gap-0.5 text-[10px] leading-none text-[var(--bros-muted)]"
              :title="chatSwitchTitle(p)"
              @click.stop
            >
              <span>Chat</span>
              <USwitch
                :model-value="p.enabled"
                :disabled="chatSwitchDisabled(p)"
                :aria-label="`Enable ${providerTitle(p)} for chat`"
                @update:model-value="(v: boolean) => setChatEnabled(p, v)"
              />
            </label>
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
        <li v-if="!customProviders.length" class="px-4 py-3 text-sm text-[var(--bros-muted)]">
          No custom providers yet.
        </li>
      </ul>
    </section>

    <UModal
      v-if="deleteTarget"
      v-model:open="deleteOpen"
      :title="`Delete ${deleteTarget}?`"
      description="Are you sure? This removes the model from this Ollama and cannot be undone."
    >
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="deleteOpen = false">Cancel</UButton>
        <UButton color="error" :loading="busy" @click="confirmDeleteModel">Delete</UButton>
      </template>
    </UModal>

    <UModal v-model:open="settingsOpen" :title="settingsTitle" description="Provider settings">
      <template #body>
        <div class="space-y-3">
          <template v-if="isAdd">
            <div class="grid gap-2">
              <UInput v-model="customForm.id" placeholder="id slug (e.g. my-proxy)" />
              <UInput v-model="customForm.name" placeholder="Display name" />
              <UInput v-model="customForm.baseUrl" placeholder="Base URL (OpenAI-compatible)" />
              <UInput v-model="customForm.apiKey" type="password" placeholder="API key (required for Chat)" />
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

      <template v-if="isAdd" #footer>
        <UButton :loading="busy" :disabled="!customForm.id || !customForm.name" @click="saveCustom">
          Save provider
        </UButton>
      </template>
      <template v-else-if="isCustomSettings && settingsProvider" #footer>
        <UButton :loading="busy" :disabled="!customForm.name" @click="saveCustom">Save</UButton>
        <UButton color="error" variant="ghost" :loading="busy" @click="removeProvider(settingsProvider.id)">Delete</UButton>
      </template>
    </UModal>
  </BrosPageShell>
</template>
