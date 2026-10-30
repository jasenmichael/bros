<script setup lang="ts">
import {
  sidecarCardBlocks,
  sidecarOpenLinks,
  sidecarTypePills,
  sidecarWebUiLinks,
  type SidecarCardBlock,
} from '../../utils/sidecars/sidecarHostLinks'
import { sidecarKindLabel } from '../../utils/sidecars/sidecarSourceLabel'
import {
  addSidecarBusy,
  isSidecarBusy,
  isSidecarRowBusy,
  removeSidecarBusy,
  sidecarBusyKey,
} from '../../utils/sidecars/sidecarBusy'

useSeoMeta({ title: 'Sidecars' })

type SidecarKind = 'core' | 'addon' | 'additional'

type SidecarRow = {
  id: string
  name: string
  description: string
  source: string
  kind: SidecarKind
  disabled?: boolean
  editable?: boolean
  gitUrl?: string
  packageSlug: string
  error?: string
  interfaces: Array<{
    type: string
    slug?: string
    service?: string
    containerPort?: number
    publish?: number
    basePath?: string
    command?: string
    bin?: string
    proxy?: { public?: boolean }
  }>
  settings: { autostart: boolean; navPinned: boolean; hostMode?: string; exposeHost?: boolean; hostProbePort?: number | null }
  cli?: Array<{ bin: string; hostInstalled: boolean; source: 'host' | 'sidecar' | 'none' }>
  status: { running: boolean; services: Array<{ name: string; state: string }> }
  hostPort?: number
  warning?: string
  hasContainer?: boolean
  password?: string
}

const { data, refresh, pending } = await useFetch<{ sidecars: SidecarRow[]; errors: string[]; viaTunnel?: boolean }>('/api/sidecars')
const busy = ref(new Set<string>())
const statusRefreshingId = ref<string | null>(null)
const copiedUrl = ref('')
const actionNote = ref('')

async function refreshStatus(id: string) {
  if (statusRefreshingId.value) return
  statusRefreshingId.value = id
  try {
    await refresh()
  } finally {
    statusRefreshingId.value = null
  }
}

function markBusy(key: string) {
  busy.value = addSidecarBusy(busy.value, key)
}

function clearBusy(key: string) {
  busy.value = removeSidecarBusy(busy.value, key)
}

function isBusy(id: string, action: string) {
  return isSidecarBusy(busy.value, id, action)
}

function hasGui(s: SidecarRow) {
  return s.interfaces.some((iface) => iface.type === 'gui')
}

function rowBusy(id: string) {
  return isSidecarRowBusy(busy.value, id)
}

function hasBusy(key: string) {
  return busy.value.has(key)
}

function isCore(s: SidecarRow) {
  return s.kind === 'core' || s.id === 'ollama'
}

function kindLabel(s: SidecarRow) {
  return sidecarKindLabel(s.source, s.kind, s.gitUrl)
}

function typePills(s: SidecarRow) {
  return sidecarTypePills(s)
}

function openLinks(s: SidecarRow) {
  return sidecarOpenLinks(s, { viaTunnel: data.value?.viaTunnel })
}

function pinLinks(s: SidecarRow) {
  return sidecarWebUiLinks(s, { viaTunnel: data.value?.viaTunnel })
}

function cardBlocks(s: SidecarRow): SidecarCardBlock[] {
  return sidecarCardBlocks(s, { viaTunnel: data.value?.viaTunnel })
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

function actionErrorMessage(err: unknown) {
  if (typeof err === 'object' && err && 'data' in err) {
    const data = (err as { data?: { statusMessage?: string; message?: string } }).data
    const statusMessage = data?.statusMessage?.trim()
    const message = data?.message?.trim()
    if (message && message !== statusMessage) return message
    if (statusMessage) return statusMessage
    if (message) return message
  }
  return err instanceof Error ? err.message : 'Action failed'
}

const { refreshPinnedNav } = usePinnedNav()

async function act(id: string, action: 'start' | 'stop' | 'restart') {
  const key = sidecarBusyKey(id, action)
  markBusy(key)
  actionNote.value = ''
  try {
    const res = await $fetch<{ warning?: string }>(`/api/sidecars/${id}/${action}`, { method: 'POST' })
    actionNote.value = res?.warning || ''
    await refresh()
  } catch (err: unknown) {
    actionNote.value = actionErrorMessage(err)
    await refresh()
  } finally {
    clearBusy(key)
    await refreshPinnedNav()
  }
}

async function patchSettings(id: string, body: {
  autostart?: boolean
  navPinned?: boolean
  exposeHost?: boolean
  hostProbePort?: number | null
}) {
  const key = sidecarBusyKey(id, 'settings')
  markBusy(key)
  try {
    await $fetch(`/api/sidecars/${id}/settings`, { method: 'PATCH', body })
    await refresh()
    await refreshPinnedNav()
  } finally {
    clearBusy(key)
  }
}

const addOpen = ref(false)
const repoOpen = ref(false)
const addForm = ref({
  id: '',
  sidecarYml: '',
  composeYml: '',
})
const repoForm = ref({ url: '', name: '' })
const formError = ref('')
const editingId = ref<string | null>(null)
const editFiles = ref({ sidecarYml: '', composeYml: '' })
const restartTarget = ref<{ id: string; reason: string } | null>(null)

function toggleAdd() {
  addOpen.value = !addOpen.value
  repoOpen.value = false
  formError.value = ''
  if (addOpen.value) fillAddTemplate()
}

function toggleRepo() {
  repoOpen.value = !repoOpen.value
  addOpen.value = false
  formError.value = ''
}

function fillAddTemplate() {
  const id = addForm.value.id.trim().toLowerCase() || 'my-sidecar'
  if (!addForm.value.sidecarYml.trim()) {
    addForm.value.sidecarYml = [
      `id: ${id}`,
      `name: ${id}`,
      'description: Additional sidecar',
      'interfaces:',
      '  - type: webui',
      `    service: ${id}`,
      '    containerPort: 80',
      '    publish: 3090',
      '',
    ].join('\n')
  }
  if (!addForm.value.composeYml.trim()) {
    addForm.value.composeYml = [
      'services:',
      `  ${id}:`,
      '    image: nginx:alpine',
      '    ports:',
      '      - "3090:80"',
      '    restart: unless-stopped',
      '    networks:',
      '      - bros',
      '',
      'networks:',
      '  bros:',
      '    external: true',
      '',
    ].join('\n')
  }
}

async function createCustom() {
  formError.value = ''
  const id = addForm.value.id.trim().toLowerCase()
  if (!id) {
    formError.value = 'id required'
    return
  }
  fillAddTemplate()
  const sidecarYml = addForm.value.sidecarYml.replace(/^id:\s*\S+/m, `id: ${id}`)
  markBusy('create')
  try {
    await $fetch('/api/sidecars', {
      method: 'POST',
      body: { id, sidecarYml, composeYml: addForm.value.composeYml },
    })
    addOpen.value = false
    addForm.value = { id: '', sidecarYml: '', composeYml: '' }
    await refresh()
  } catch (err: unknown) {
    formError.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (err instanceof Error ? err.message : 'Create failed')
  } finally {
    clearBusy('create')
  }
}

async function cloneRepo() {
  formError.value = ''
  if (!repoForm.value.url.trim()) {
    formError.value = 'Git URL required'
    return
  }
  markBusy('clone')
  try {
    await $fetch('/api/sidecars/from-repo', {
      method: 'POST',
      body: { url: repoForm.value.url.trim(), name: repoForm.value.name.trim() || undefined },
    })
    repoOpen.value = false
    repoForm.value = { url: '', name: '' }
    await refresh()
  } catch (err: unknown) {
    formError.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (err instanceof Error ? err.message : 'Clone failed')
  } finally {
    clearBusy('clone')
  }
}

async function openEdit(s: SidecarRow) {
  formError.value = ''
  const key = sidecarBusyKey(s.id, 'edit')
  markBusy(key)
  try {
    const files = await $fetch<{ sidecarYml: string; composeYml: string }>(`/api/sidecars/${s.id}/files`)
    editFiles.value = { sidecarYml: files.sidecarYml, composeYml: files.composeYml }
    editingId.value = s.id
    if (!cardOpen(s.id)) toggleCard(s.id)
  } catch (err: unknown) {
    formError.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (err instanceof Error ? err.message : 'Load failed')
  } finally {
    clearBusy(key)
  }
}

async function saveEdit() {
  const id = editingId.value
  if (!id) return
  formError.value = ''
  const key = sidecarBusyKey(id, 'save')
  markBusy(key)
  try {
    const res = await $fetch<{ composeChanged: boolean }>(`/api/sidecars/${id}/files`, {
      method: 'PUT',
      body: editFiles.value,
    })
    editingId.value = null
    await refresh()
    const row = data.value?.sidecars.find((s) => s.id === id)
    if (row?.hasContainer || row?.status.running || res.composeChanged) {
      restartTarget.value = { id, reason: 'Saved files. Restart this sidecar to apply compose changes?' }
    }
  } catch (err: unknown) {
    formError.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (err instanceof Error ? err.message : 'Save failed')
  } finally {
    clearBusy(key)
  }
}

async function checkImage(s: SidecarRow) {
  formError.value = ''
  const key = sidecarBusyKey(s.id, 'check')
  markBusy(key)
  try {
    const res = await $fetch<{ available: boolean }>(`/api/apps/${s.id}/update`)
    actionNote.value = res.available ? `${s.name} update available` : `${s.name} is up to date`
  } catch (err: unknown) {
    formError.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (err instanceof Error ? err.message : 'Check failed')
  } finally {
    clearBusy(key)
  }
}

async function updateImage(s: SidecarRow) {
  formError.value = ''
  const key = sidecarBusyKey(s.id, 'image')
  markBusy(key)
  try {
    const res = await $fetch<{ code: number; stderr: string }>(`/api/apps/${s.id}/update`, { method: 'POST' })
    actionNote.value = res.code === 0 ? (res.stderr || `${s.name} updated`) : (res.stderr || 'Update failed')
  } catch (err: unknown) {
    formError.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (err instanceof Error ? err.message : 'Update failed')
  } finally {
    clearBusy(key)
    await refresh()
  }
}

async function updateRepo(s: SidecarRow) {
  formError.value = ''
  const key = sidecarBusyKey(s.id, 'update')
  markBusy(key)
  try {
    const res = await $fetch<{ composeChanged: boolean }>(`/api/sidecars/${s.id}/update`, { method: 'POST' })
    await refresh()
    if (res.composeChanged) {
      restartTarget.value = { id: s.id, reason: 'Compose changed after git pull. Restart this sidecar?' }
    } else {
      actionNote.value = 'Repo already up to date.'
    }
  } catch (err: unknown) {
    formError.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (err instanceof Error ? err.message : 'Update failed')
  } finally {
    clearBusy(key)
  }
}

async function confirmRestart() {
  const target = restartTarget.value
  if (!target) return
  restartTarget.value = null
  await act(target.id, 'restart')
}

const stateFilter = ref<'all' | 'running' | 'stopped'>('all')
const typeFilter = ref('all')
const kindFilter = ref<'all' | 'core' | 'addon' | 'custom'>('all')
const openCards = ref<string[]>([])

const stateTabs = [
  { id: 'all' as const, label: 'All' },
  { id: 'running' as const, label: 'Running' },
  { id: 'stopped' as const, label: 'Stopped' },
]
const typeTabs = [
  { id: 'all', label: 'All' },
  { id: 'webui', label: 'webui' },
  { id: 'api', label: 'api' },
  { id: 'openai', label: 'openapi' },
  { id: 'cli', label: 'cli' },
  { id: 'gui', label: 'gui' },
]
const kindTabs = [
  { id: 'all' as const, label: 'All' },
  { id: 'core' as const, label: 'Core' },
  { id: 'addon' as const, label: 'Addon' },
  { id: 'custom' as const, label: 'Custom' },
]

function cardKind(s: SidecarRow): 'core' | 'addon' | 'custom' {
  if (s.kind === 'core' || s.id === 'ollama') return 'core'
  if (s.kind === 'addon') return 'addon'
  return 'custom'
}

function cardOpen(id: string) {
  return openCards.value.includes(id)
}

function toggleCard(id: string) {
  openCards.value = cardOpen(id) ? openCards.value.filter((row) => row !== id) : [...openCards.value, id]
}

const filterGroupClass = 'flex w-fit rounded-lg border border-[var(--bros-border)] p-0.5'

function tabOn(on: boolean) {
  return on
    ? 'rounded-md bg-[var(--bros-accent)] px-2.5 py-1 text-sm text-white'
    : 'rounded-md px-2.5 py-1 text-sm text-[var(--bros-muted)] hover:text-white'
}

const filtered = computed(() => (data.value?.sidecars || []).filter((s) => {
  if (stateFilter.value === 'running' && !s.status.running) return false
  if (stateFilter.value === 'stopped' && s.status.running) return false
  if (kindFilter.value !== 'all' && cardKind(s) !== kindFilter.value) return false
  if (typeFilter.value !== 'all' && !s.interfaces.some((iface) => iface.type === typeFilter.value)) return false
  return true
}))

/** Two-up only when this section has 2+ rows. Columns follow the section container, not the viewport. */
function sectionTwoCol(count: number) {
  return count >= 2
}

function sectionGridClass(count: number) {
  return sectionTwoCol(count)
    ? 'grid items-stretch gap-4 grid-cols-1 @3xl/sidecar:grid-cols-2'
    : 'grid gap-4 grid-cols-1'
}
</script>

<template>
  <BrosPageShell title="Sidecars" description="Core always runs. Addon and custom stay stopped until you turn Autostart on or press Start.">
    <div v-if="data?.errors?.length" class="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      <p v-for="(err, i) in data.errors" :key="i">{{ err }}</p>
    </div>
    <div v-if="actionNote" class="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      {{ actionNote }}
    </div>
    <div v-if="formError" class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
      {{ formError }}
    </div>

    <div v-if="pending && !data" class="text-[var(--bros-muted)]">Loading…</div>
    <div v-else class="@container/sidecar space-y-4">
      <div class="flex justify-start">
        <div class="flex flex-wrap gap-2">
          <UButton size="sm" color="primary" variant="soft" @click="toggleAdd">Add sidecar</UButton>
          <UButton size="sm" color="neutral" variant="outline" @click="toggleRepo">From a repo</UButton>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3" data-sidecar-filters>
        <div :class="filterGroupClass" role="group" aria-label="Run state">
          <button
            v-for="opt in stateTabs"
            :key="opt.id"
            type="button"
            :class="tabOn(stateFilter === opt.id)"
            :aria-pressed="stateFilter === opt.id"
            @click="stateFilter = opt.id"
          >{{ opt.label }}</button>
        </div>
        <div :class="filterGroupClass" role="group" aria-label="Interface type">
          <button
            v-for="opt in typeTabs"
            :key="opt.id"
            type="button"
            :class="tabOn(typeFilter === opt.id)"
            :aria-pressed="typeFilter === opt.id"
            @click="typeFilter = opt.id"
          >{{ opt.label }}</button>
        </div>
        <div :class="filterGroupClass" role="group" aria-label="Sidecar kind">
          <button
            v-for="opt in kindTabs"
            :key="opt.id"
            type="button"
            :class="tabOn(kindFilter === opt.id)"
            :aria-pressed="kindFilter === opt.id"
            @click="kindFilter = opt.id"
          >{{ opt.label }}</button>
        </div>
      </div>
      <p class="text-sm text-[var(--bros-muted)]">Core always runs and has no Restart. Addon and custom stay stopped until Autostart is on and Bros restarts, or you press Start.</p>

      <div v-if="addOpen" class="space-y-3 rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
          <UInput v-model="addForm.id" placeholder="id slug (not ollama / whisper / opencode / openwebui / firecrawl / firecrawl-ui)" aria-label="Sidecar id" />
          <UTextarea v-model="addForm.sidecarYml" placeholder="sidecar.yml" aria-label="sidecar.yml" :rows="8" class="font-mono text-xs" />
          <UTextarea v-model="addForm.composeYml" placeholder="docker-compose.yml" aria-label="docker-compose.yml" :rows="10" class="font-mono text-xs" />
          <div class="flex gap-2">
            <UButton size="sm" color="primary" :loading="hasBusy('create')" @click="createCustom">Create</UButton>
            <UButton size="sm" color="neutral" variant="ghost" @click="() => { addOpen = false }">Cancel</UButton>
          </div>
        </div>

      <div v-if="repoOpen" class="space-y-3 rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
          <UInput v-model="repoForm.url" placeholder="https://github.com/org/sidecars.git" aria-label="Git repo URL" />
          <UInput v-model="repoForm.name" placeholder="folder name (optional)" aria-label="Repo folder name" />
          <p class="text-xs text-[var(--bros-muted)]">Clones into lib/sidecars/custom/&lt;name&gt;/ and loads that tree’s sidecars/ dir.</p>
          <div class="flex gap-2">
            <UButton size="sm" color="primary" :loading="hasBusy('clone')" @click="cloneRepo">Clone</UButton>
            <UButton size="sm" color="neutral" variant="ghost" @click="() => { repoOpen = false }">Cancel</UButton>
          </div>
        </div>

      <p v-if="!filtered.length" class="text-sm text-[var(--bros-muted)]">None.</p>

      <div
        :class="sectionGridClass(filtered.length)"
        data-sidecar-section="list"
        :data-sidecar-grid="sectionTwoCol(filtered.length) ? 'multi' : 'single'"
      >
        <article
          v-for="s in filtered"
          :key="s.id"
          :data-sidecar-card="s.id"
          :data-card-layout="sectionTwoCol(filtered.length) ? 'compact' : 'wide'"
          class="flex h-full flex-col rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 px-[15px] py-[8px]"
          :class="sectionTwoCol(filtered.length) ? 'min-h-[202px]' : undefined"
        >
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-medium text-white">{{ s.name }} ({{ kindLabel(s) }})</h3>
                  <div v-if="typePills(s).length" class="flex flex-wrap gap-1" data-sidecar-types>
                    <UBadge v-for="label in typePills(s)" :key="label" variant="soft">
                      {{ label }}
                    </UBadge>
                  </div>
                </div>
                <p class="mt-1 text-sm text-[var(--bros-muted)]">{{ s.description }}</p>
              </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <UButton
                      icon="i-lucide-refresh-cw"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :loading="statusRefreshingId === s.id"
                      aria-label="Refresh sidecar status"
                      @click="refreshStatus(s.id)"
                    />
                    <UBadge :color="s.disabled ? 'neutral' : s.status.running ? 'success' : 'error'" variant="subtle">
                      {{ s.disabled ? 'disabled' : s.status.running ? 'running' : 'stopped' }}
                    </UBadge>
                  </div>
                </div>

            <div class="mt-auto flex flex-col gap-3">
            <div class="flex flex-nowrap items-center gap-2" data-sidecar-actions>
                <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <UButton
                  v-if="s.id === 'desktop'"
                  to="/terminal"
                  size="sm"
                  color="primary"
                  variant="outline"
                  class="px-1.5"
                >Terminal</UButton>
                <UButton
                  v-if="!isCore(s)"
                  size="sm"
                  color="success"
                  variant="outline"
                  class="px-1.5"
                  :class="s.status.running && !s.error ? 'bg-success/10' : undefined"
                  :loading="isBusy(s.id, 'start')"
                  :disabled="!!s.error || (rowBusy(s.id) && !isBusy(s.id, 'start'))"
                  @click="act(s.id, 'start')"
                >Start</UButton>
                <UButton
                  v-if="!isCore(s)"
                  size="sm"
                  color="error"
                  variant="outline"
                  class="px-1.5"
                  :class="!s.status.running && !s.error ? 'bg-error/10' : undefined"
                  :loading="isBusy(s.id, 'stop')"
                  :disabled="rowBusy(s.id) && !isBusy(s.id, 'stop')"
                  @click="act(s.id, 'stop')"
                >Stop</UButton>
                <UButton
                  v-if="!isCore(s)"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  class="px-1.5"
                  :loading="isBusy(s.id, 'restart')"
                  :disabled="!!s.error || (rowBusy(s.id) && !isBusy(s.id, 'restart'))"
                  @click="act(s.id, 'restart')"
                >Restart</UButton>
                <UButton
                  v-for="link in openLinks(s)"
                  :key="link.to"
                  size="sm"
                  color="primary"
                  variant="soft"
                  class="px-1.5"
                  :to="link.to"
                  :target="link.external ? '_blank' : undefined"
                >
                  Open {{ link.label }} (:{{ link.hostPort }})
                </UButton>
                <UButton
                  v-if="hasGui(s)"
                  :to="'/desktop'"
                  size="sm"
                  color="primary"
                  variant="soft"
                  class="px-1.5"
                >Open {{ s.name }}</UButton>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  class="px-1.5"
                  :to="`/sidecars/${s.id}/logs`"
                >Logs</UButton>
                <UButton
                  v-if="s.editable"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  class="px-1.5"
                  :loading="isBusy(s.id, 'edit')"
                  @click="openEdit(s)"
                >Edit</UButton>
                <UButton
                  v-if="!(s.gitUrl || (s.source !== 'shipped' && s.source !== 'custom'))"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  class="px-1.5"
                  :loading="isBusy(s.id, 'check')"
                  @click="checkImage(s)"
                >Check</UButton>
                <UButton
                  v-if="!(s.gitUrl || (s.source !== 'shipped' && s.source !== 'custom'))"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  class="px-1.5"
                  :loading="isBusy(s.id, 'image')"
                  @click="updateImage(s)"
                >Update</UButton>
                <UButton
                  v-if="s.gitUrl || (s.source !== 'shipped' && s.source !== 'custom')"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  class="px-1.5"
                  :loading="isBusy(s.id, 'update')"
                  @click="updateRepo(s)"
                >Update</UButton>
                </div>
                <p v-if="s.password" class="flex items-center gap-2 text-xs text-[var(--bros-muted)]">
                  Password
                  <button type="button" class="font-mono text-white" @click="copyUrl(s.password || '')">{{ s.password }}</button>
                </p>
                <UButton
                  class="ml-auto shrink-0"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="cardOpen(s.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  :aria-expanded="cardOpen(s.id)"
                  :aria-label="cardOpen(s.id) ? 'Hide sidecar details' : 'Show sidecar details'"
                  @click="toggleCard(s.id)"
                />
              </div>
            <div v-if="!isCore(s) || pinLinks(s).length" class="flex flex-wrap items-center gap-4 text-sm" data-sidecar-toggles>
              <label v-if="!isCore(s)" class="flex items-center gap-2 text-[var(--bros-muted)]">
                <USwitch
                  :model-value="s.settings.autostart && !s.disabled"
                  :disabled="rowBusy(s.id) || s.disabled"
                  @update:model-value="(v: boolean) => patchSettings(s.id, { autostart: v })"
                />
                Autostart
              </label>
              <label v-if="pinLinks(s).length" class="flex items-center gap-2 text-[var(--bros-muted)]">
                <USwitch
                  :model-value="s.settings.navPinned"
                  :disabled="rowBusy(s.id)"
                  @update:model-value="(v: boolean) => patchSettings(s.id, { navPinned: v })"
                />
                Pin in nav
              </label>
            </div>
            </div>

            <div v-show="cardOpen(s.id)" class="space-y-4" data-sidecar-details>
              <p v-if="s.error" class="text-sm text-red-400">{{ s.error }}</p>
              <p v-else-if="s.warning" class="text-sm text-amber-300">{{ s.warning }}</p>
              <p v-if="s.disabled" class="text-sm text-[var(--bros-muted)]">Env-disabled: not autostarted. Start still works.</p>
                <div v-for="block in cardBlocks(s)" :key="block.label" class="space-y-2" :data-card-block="block.label">
                  <p class="text-xs font-medium tracking-wide text-[var(--bros-muted)]">{{ block.label }}</p>
                  <div
                    v-for="(row, index) in block.rows"
                    :key="row.url || row.command || index"
                    class="flex items-center gap-2 rounded-lg border border-[var(--bros-border)] bg-[var(--bros-bg)]/60 px-3 py-2"
                  >
                    <div class="min-w-0 flex-1">
                      <p v-if="row.command" class="truncate font-mono text-sm text-white">{{ row.command }}</p>
                      <template v-else-if="row.url">
                        <a
                          v-if="row.network !== 'bros'"
                          :href="row.url"
                          class="block truncate font-mono text-sm text-[var(--bros-accent)] hover:underline"
                          :title="row.url"
                          @click.prevent="copyUrl(row.url)"
                        >{{ row.url }}</a>
                        <button
                          v-else
                          type="button"
                          class="block w-full truncate text-left font-mono text-sm text-white"
                          :title="row.url"
                          @click="copyUrl(row.url)"
                        >{{ row.url }}</button>
                        <p v-if="row.network" class="text-[0.65rem] text-[var(--bros-muted)]">
                          {{ row.network === 'host' ? 'Reachable from host' : 'Bros Docker network' }}
                        </p>
                      </template>
                    </div>
                    <UButton
                      v-if="row.url"
                      size="xs"
                      color="neutral"
                      variant="soft"
                      :icon="copiedUrl === row.url ? 'i-lucide-check' : 'i-lucide-copy'"
                      :aria-label="copiedUrl === row.url ? 'Copied' : 'Copy URL'"
                      @click="copyUrl(row.url)"
                    />
                  </div>
                </div>

                <p v-if="s.id === 'desktop'" class="text-xs text-[var(--bros-muted)]">
                  Terminal shell is bash. Bros does not expose bash to the host. Other sidecar CLIs are on Terminal under Expose CLIs.
                </p>

                <div class="flex flex-wrap items-center gap-4 text-sm">
                  <p v-for="row in s.cli || []" :key="row.bin" class="text-xs text-[var(--bros-muted)]">
                    {{ row.bin }}: Bros uses {{ row.source }}<span v-if="row.hostInstalled"> (host installed)</span>
                  </p>
                </div>

                <div v-if="editingId === s.id" class="space-y-3">
                  <UTextarea v-model="editFiles.sidecarYml" :rows="8" class="font-mono text-xs" />
                  <UTextarea v-model="editFiles.composeYml" :rows="10" class="font-mono text-xs" />
                  <div class="flex gap-2">
                    <UButton size="sm" color="primary" :loading="isBusy(s.id, 'save')" @click="() => { void saveEdit() }">Save</UButton>
                    <UButton size="sm" color="neutral" variant="ghost" @click="() => { editingId = null }">Cancel</UButton>
                  </div>
                </div>
              </div>
            </div>
          </article>
      </div>
    </div>

    <UModal
      v-if="restartTarget"
      :open="!!restartTarget"
      title="Restart sidecar?"
      :description="restartTarget.reason"
      @update:open="(v: boolean) => { if (!v) restartTarget = null }"
    >
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="() => { restartTarget = null }">Not now</UButton>
        <UButton color="primary" :loading="restartTarget ? isBusy(restartTarget.id, 'restart') : false" @click="confirmRestart">Restart</UButton>
      </template>
    </UModal>
  </BrosPageShell>
</template>
