<script setup lang="ts">
useSeoMeta({ title: 'Models' })

type Provider = {
  id: string
  name: string
  kind: string
  baseUrl: string | null
  enabled: boolean
  hasApiKey: boolean
  config: Record<string, unknown>
}

type OllamaModel = { id: string; name: string; size?: number }

const { data, refresh, pending } = await useFetch<{
  providers: Provider[]
  ollamaModels: OllamaModel[]
  ollamaError: string | null
  ollamaBaseUrl?: string
  ollamaSource?: 'host' | 'sidecar' | 'external'
  hostOllama?: { port: number; version: string } | null
  hostOllamaError?: string | null
  sidecarPublish?: number
  sidecarDns?: string
}>('/api/models')

const pullName = ref<string | { label: string; value: string } | undefined>('')
const externalUrl = ref('')
const busy = ref(false)
const err = ref('')
const useGpu = ref(false)

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

const { data: libraryData, pending: libraryPending, refresh: refreshLibrary } = await useFetch<LibraryResponse>('/api/models/ollama/library', {
  key: 'ollama-library',
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

const installedNames = computed(() => new Set((data.value?.ollamaModels || []).map((m) => m.name)))
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

/** Three-section dropdown: Recommended | Ollama | Hugging Face */
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
  const name = pullModelName.value
  if (!name) return false
  const s = libraryData.value?.sections
  if (!s) return false
  const hit = [...s.recommended, ...s.ollama, ...s.huggingface, ...(s.custom || [])].find((m) => m.name === name)
  return hit ? !fitsDisk(hit.sizeBytes) : false
})

watchEffect(() => {
  if (data.value?.ollamaBaseUrl) externalUrl.value = data.value.ollamaBaseUrl
})

const ollama = computed(() => data.value?.providers.find((p) => p.id === 'ollama'))
const paid = computed(() => data.value?.providers.filter((p) => p.id !== 'ollama') || [])
const gpu = computed(() => libraryData.value?.gpu)
const diskLabel = computed(() => {
  const d = libraryData.value?.disk
  if (!d?.freeBytes) return null
  return `${formatSize(d.freeBytes)} free`
})

const providerForm = reactive({
  id: '',
  name: '',
  kind: 'openai' as 'openai' | 'anthropic',
  baseUrl: '',
  apiKey: '',
})

const ollamaMode = computed(() => {
  const mode = ollama.value?.config?.mode as string | undefined
  if (mode === 'host' || mode === 'sidecar' || mode === 'external') return mode
  return data.value?.ollamaSource || 'sidecar'
})

async function setOllamaMode(mode: 'host' | 'sidecar' | 'external') {
  busy.value = true
  err.value = ''
  try {
    const hostUrl = data.value?.hostOllama
      ? `http://host.docker.internal:${data.value.hostOllama.port}`
      : 'http://host.docker.internal:11434'
    await $fetch('/api/models/providers', {
      method: 'POST',
      body: {
        id: 'ollama',
        name: 'Ollama',
        kind: 'ollama',
        baseUrl: mode === 'sidecar'
          ? (data.value?.sidecarDns || 'http://ollama:11434')
          : mode === 'host'
            ? hostUrl
            : (externalUrl.value || hostUrl),
        config: { ...(ollama.value?.config || {}), mode },
      },
    })
    await refresh()
  } catch (e: unknown) {
    err.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Update failed'
  } finally {
    busy.value = false
  }
}

async function saveExternalUrl() {
  busy.value = true
  try {
    await $fetch('/api/models/providers', {
      method: 'POST',
      body: {
        id: 'ollama',
        name: 'Ollama',
        kind: 'ollama',
        baseUrl: externalUrl.value,
        config: { ...(ollama.value?.config || {}), mode: 'external' },
      },
    })
    await refresh()
  } finally {
    busy.value = false
  }
}

async function pullModel() {
  const name = pullModelName.value
  if (!name) return
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
      body: JSON.stringify({ model: name }),
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
  busy.value = true
  try {
    await $fetch('/api/models/ollama/delete', { method: 'POST', body: { model: name } })
    await refresh()
  } finally {
    busy.value = false
  }
}

async function saveProvider() {
  if (!providerForm.id || !providerForm.name) return
  busy.value = true
  try {
    await $fetch('/api/models/providers', { method: 'POST', body: { ...providerForm } })
    providerForm.id = ''
    providerForm.name = ''
    providerForm.apiKey = ''
    providerForm.baseUrl = ''
    await refresh()
  } finally {
    busy.value = false
  }
}

async function removeProvider(id: string) {
  await $fetch(`/api/models/providers/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <BrosPageShell title="Models" description="Host Ollama or Bros sidecar, plus paid OpenAI-compatible and Anthropic providers.">
    <p v-if="err" class="mb-4 text-sm text-red-400">{{ err }}</p>
    <div v-if="pending" class="text-[var(--bros-muted)]">Loading…</div>

    <section class="mb-10 space-y-4">
      <h2 class="text-xl font-medium text-white">Ollama</h2>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="sm"
          :variant="ollamaMode === 'host' ? 'solid' : 'outline'"
          :disabled="!data?.hostOllama"
          @click="setOllamaMode('host')"
        >
          Host{{ data?.hostOllama ? ` :${data.hostOllama.port}` : '' }}
        </UButton>
        <UButton size="sm" :variant="ollamaMode === 'sidecar' ? 'solid' : 'outline'" @click="setOllamaMode('sidecar')">
          Sidecar DNS
        </UButton>
        <UButton size="sm" :variant="ollamaMode === 'external' ? 'solid' : 'outline'" color="neutral" @click="setOllamaMode('external')">
          External URL
        </UButton>
      </div>
      <p class="text-xs text-[var(--bros-muted)]">
        <span v-if="data?.hostOllama">Host Ollama v{{ data.hostOllama.version }} on :{{ data.hostOllama.port }}.</span>
        <span v-else-if="data?.hostOllamaError">{{ data.hostOllamaError }}</span>
        <span v-else>No host Ollama found (scanned 11434, 11436, 22000).</span>
        Bros sidecar publishes :{{ data?.sidecarPublish || 11435 }} (Chat uses {{ data?.sidecarDns || 'http://ollama:11434' }} on the Docker network).
      </p>
      <p v-if="ollamaMode === 'host'" class="text-xs text-amber-200">
        Pull and Chat write to the host Ollama disk, not $BROS_DIR/data/ollama.
      </p>
      <div v-if="ollamaMode === 'external'" class="flex max-w-xl gap-2">
        <UInput v-model="externalUrl" placeholder="http://host.docker.internal:11434" class="flex-1" />
        <UButton :loading="busy" @click="saveExternalUrl">Save URL</UButton>
      </div>

      <div
        v-if="gpu?.available"
        class="flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--bros-border)] bg-[var(--bros-bg)]/50 px-3 py-2"
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

      <p v-if="data?.ollamaError" class="text-sm text-amber-400">{{ data.ollamaError }}</p>
      <p v-if="diskLabel" class="text-xs text-[var(--bros-muted)]">
        Disk: {{ diskLabel }} on <span class="font-mono">{{ libraryData?.disk?.path }}</span> (5 GB margin kept free)
      </p>
      <div class="flex max-w-xl gap-2">
        <UInputMenu
          v-model="pullName"
          value-key="value"
          :items="pullItems"
          :loading="libraryPending"
          create-item
          open-on-focus
          :filter-fields="['label', 'value']"
          placeholder="Search Recommended / Ollama / Hugging Face"
          class="flex-1"
          :ui="{ content: 'min-w-fit max-w-xl' }"
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
          :disabled="!pullModelName || selectedTooBig"
          @click="pullModel"
        >
          Pull
        </UButton>
      </div>
      <p v-if="selectedTooBig" class="max-w-xl text-sm text-amber-400">
        Not enough disk for this model. Free space or pick a smaller one.
      </p>
      <div
        v-if="pullProgress.active || pullProgress.status === 'Done'"
        class="max-w-xl space-y-2 rounded-lg border border-[var(--bros-border)] bg-[var(--bros-bg)]/50 px-3 py-3"
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
      <p class="max-w-xl text-xs text-[var(--bros-muted)]">
        Sizes are on-disk download estimates. Tags must exist on ollama.com (official
        <span class="font-mono">library/name</span> or <span class="font-mono">user/name:tag</span>).
        Recommended stays ≤ 16 GB. HF GGUF: <span class="font-mono">hf.co/user/repo:Q4_K_M</span>.
        Oversized entries are disabled.
      </p>
      <ul class="divide-y divide-[var(--bros-border)] rounded-xl border border-[var(--bros-border)]">
        <li v-for="m in data?.ollamaModels || []" :key="m.id" class="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <div class="font-mono text-sm text-white">{{ m.id }}</div>
            <div v-if="m.size" class="text-xs text-[var(--bros-muted)]">{{ Math.round(m.size / 1e6) }} MB</div>
          </div>
          <UButton size="xs" color="error" variant="ghost" @click="removeModel(m.name)">Delete</UButton>
        </li>
        <li v-if="!(data?.ollamaModels || []).length" class="px-4 py-3 text-sm text-[var(--bros-muted)]">
          {{ data?.ollamaError ? 'Could not list models.' : 'No models yet — pull one above (e.g. llama3.2).' }}
        </li>
      </ul>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-medium text-white">Paid providers</h2>
      <div class="grid max-w-xl gap-2">
        <UInput v-model="providerForm.id" placeholder="id (e.g. openai)" />
        <UInput v-model="providerForm.name" placeholder="Display name" />
        <USelect
          v-model="providerForm.kind"
          :items="[
            { label: 'OpenAI-compatible', value: 'openai' },
            { label: 'Anthropic', value: 'anthropic' },
          ]"
        />
        <UInput v-model="providerForm.baseUrl" placeholder="Base URL (optional)" />
        <UInput v-model="providerForm.apiKey" type="password" placeholder="API key" />
        <UButton :loading="busy" @click="saveProvider">Save provider</UButton>
      </div>
      <ul class="divide-y divide-[var(--bros-border)] rounded-xl border border-[var(--bros-border)]">
        <li v-for="p in paid" :key="p.id" class="flex items-center justify-between px-4 py-3">
          <div>
            <div class="text-white">{{ p.name }} <span class="font-mono text-xs text-[var(--bros-muted)]">({{ p.id }})</span></div>
            <div class="text-xs text-[var(--bros-muted)]">{{ p.kind }} · key {{ p.hasApiKey ? 'set' : 'missing' }}</div>
          </div>
          <UButton size="xs" color="error" variant="ghost" @click="removeProvider(p.id)">Remove</UButton>
        </li>
        <li v-if="!paid.length" class="px-4 py-3 text-sm text-[var(--bros-muted)]">No paid providers yet. Model ids use provider/model.</li>
      </ul>
    </section>
  </BrosPageShell>
</template>
