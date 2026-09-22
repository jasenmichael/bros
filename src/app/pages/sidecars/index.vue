<script setup lang="ts">
import { sidecarApiCopyUrls, sidecarOpenLinks, sidecarWebUiLinks } from '../../utils/sidecarHostLinks'
import { sidecarSourceLabel } from '../../utils/sidecarSourceLabel'

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
    service: string
    containerPort?: number
    publish?: number
    basePath?: string
  }>
  settings: { autostart: boolean; navPinned: boolean; hostProbePort?: number | null }
  status: { running: boolean; services: Array<{ name: string; state: string }> }
  hostPort?: number
  warning?: string
  hasContainer?: boolean
}

const { data, refresh, pending } = await useFetch<{ sidecars: SidecarRow[]; errors: string[]; viaTunnel?: boolean }>('/api/sidecars')
const busy = ref<string | null>(null)
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

function busyKey(id: string, action: string) {
  return `${id}:${action}`
}

function isBusy(id: string, action: string) {
  return busy.value === busyKey(id, action)
}

function rowBusy(id: string) {
  return typeof busy.value === 'string' && busy.value.startsWith(`${id}:`)
}

function rowsOf(kind: SidecarKind) {
  return (data.value?.sidecars || []).filter((s) => s.kind === kind)
}

function isCore(s: SidecarRow) {
  return s.kind === 'core' || s.id === 'ollama'
}

function sourceLabel(s: SidecarRow) {
  return sidecarSourceLabel(s.source, s.gitUrl)
}

function openLinks(s: SidecarRow) {
  return sidecarOpenLinks(s)
}

function pinLinks(s: SidecarRow) {
  return sidecarWebUiLinks(s)
}

/** OpenAI-compatible base URLs for tools that speak /v1 (or sidecar basePath). */
function openaiEndpoints(s: SidecarRow) {
  return s.interfaces
    .filter((i) => i.type === 'openai')
    .map((i) => {
      const basePath = (i.basePath || '/v1').startsWith('/') ? (i.basePath || '/v1') : `/${i.basePath}`
      const publish = i.publish
        || s.interfaces.find((w) => w.type === 'webui' && w.service === i.service && w.publish)?.publish
      const url = publish
        ? `http://127.0.0.1:${publish}${basePath}`
        : `http://${i.service}:${i.containerPort}${basePath}`
      return { url, network: publish ? 'host' as const : 'bros' as const }
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

function actionErrorMessage(err: unknown) {
  if (typeof err === 'object' && err && 'data' in err) {
    const data = (err as { data?: { statusMessage?: string; message?: string } }).data
    if (data?.statusMessage) return data.statusMessage
    if (data?.message) return data.message
  }
  return err instanceof Error ? err.message : 'Action failed'
}

async function act(id: string, action: 'start' | 'stop' | 'restart') {
  busy.value = busyKey(id, action)
  actionNote.value = ''
  try {
    const res = await $fetch<{ warning?: string }>(`/api/sidecars/${id}/${action}`, { method: 'POST' })
    actionNote.value = res?.warning || ''
    await refresh()
  } catch (err: unknown) {
    actionNote.value = actionErrorMessage(err)
    await refresh()
  } finally {
    busy.value = null
  }
}

const { refreshPinnedNav } = usePinnedNav()

async function patchSettings(id: string, body: {
  autostart?: boolean
  navPinned?: boolean
  hostProbePort?: number | null
}) {
  busy.value = busyKey(id, 'settings')
  try {
    await $fetch(`/api/sidecars/${id}/settings`, { method: 'PATCH', body })
    await refresh()
    await refreshPinnedNav()
  } finally {
    busy.value = null
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
  busy.value = 'create'
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
    busy.value = null
  }
}

async function cloneRepo() {
  formError.value = ''
  if (!repoForm.value.url.trim()) {
    formError.value = 'Git URL required'
    return
  }
  busy.value = 'clone'
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
    busy.value = null
  }
}

async function openEdit(s: SidecarRow) {
  formError.value = ''
  busy.value = busyKey(s.id, 'edit')
  try {
    const files = await $fetch<{ sidecarYml: string; composeYml: string }>(`/api/sidecars/${s.id}/files`)
    editFiles.value = { sidecarYml: files.sidecarYml, composeYml: files.composeYml }
    editingId.value = s.id
  } catch (err: unknown) {
    formError.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (err instanceof Error ? err.message : 'Load failed')
  } finally {
    busy.value = null
  }
}

async function saveEdit() {
  const id = editingId.value
  if (!id) return
  formError.value = ''
  busy.value = busyKey(id, 'save')
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
    busy.value = null
  }
}

async function updateRepo(s: SidecarRow) {
  formError.value = ''
  busy.value = busyKey(s.id, 'update')
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
    busy.value = null
  }
}

async function confirmRestart() {
  const target = restartTarget.value
  if (!target) return
  restartTarget.value = null
  await act(target.id, 'restart')
}

const sections = computed(() => [
  {
    key: 'core' as const,
    title: 'Core',
    blurb: 'Must-run. Always on. Bros health-checks Ollama and restarts it only when necessary.',
    rows: rowsOf('core'),
  },
  {
    key: 'addon' as const,
    title: 'Addon sidecars',
    blurb: 'Shipped packs plus user packs from the data dir or a git clone. Disable shipped addons with BROS_SIDECAR_<ID>=0 or BROS_SIDECARS_DISABLE.',
    rows: [...rowsOf('addon'), ...rowsOf('additional')],
  },
])

/** Two-up compact cards only when this section has 2+ rows. One row (or mobile) uses the wide card. */
function sectionTwoCol(count: number) {
  return count >= 2
}

function sectionGridClass(count: number) {
  return sectionTwoCol(count) ? 'grid gap-4 lg:grid-cols-2' : 'grid gap-4 grid-cols-1'
}

function cardInnerClass(count: number) {
  return sectionTwoCol(count)
    ? 'flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6 lg:flex-col lg:gap-4'
    : 'flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6'
}

function cardControlsClass(count: number) {
  return sectionTwoCol(count)
    ? 'min-w-0 space-y-4 sm:w-80 sm:shrink-0 lg:w-full'
    : 'min-w-0 space-y-4 sm:min-w-[18rem] sm:max-w-xl sm:flex-1'
}
</script>

<template>
  <BrosPageShell title="Sidecars" description="Core Ollama, then addon sidecars (shipped, git clone, or data dir).">
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
    <div v-else class="space-y-10">
      <section v-for="sec in sections" :key="sec.key">
        <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-lg font-medium text-white">{{ sec.title }}</h2>
            <p class="mt-1 text-sm text-[var(--bros-muted)]">{{ sec.blurb }}</p>
          </div>
          <div v-if="sec.key === 'addon'" class="flex flex-wrap gap-2">
            <UButton size="sm" color="primary" variant="soft" @click="toggleAdd">
              Add sidecar
            </UButton>
            <UButton size="sm" color="neutral" variant="outline" @click="toggleRepo">
              From a repo
            </UButton>
          </div>
        </div>

        <div v-if="sec.key === 'addon' && addOpen" class="mb-4 space-y-3 rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
          <UInput v-model="addForm.id" placeholder="id slug (not ollama / opencode / openwebui / firecrawl / firecrawl-ui)" aria-label="Sidecar id" />
          <UTextarea v-model="addForm.sidecarYml" placeholder="sidecar.yml" aria-label="sidecar.yml" :rows="8" class="font-mono text-xs" />
          <UTextarea v-model="addForm.composeYml" placeholder="docker-compose.yml" aria-label="docker-compose.yml" :rows="10" class="font-mono text-xs" />
          <div class="flex gap-2">
            <UButton size="sm" color="primary" :loading="busy === 'create'" @click="createCustom">Create</UButton>
            <UButton size="sm" color="neutral" variant="ghost" @click="addOpen = false">Cancel</UButton>
          </div>
        </div>

        <div v-if="sec.key === 'addon' && repoOpen" class="mb-4 space-y-3 rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
          <UInput v-model="repoForm.url" placeholder="https://github.com/org/sidecars.git" aria-label="Git repo URL" />
          <UInput v-model="repoForm.name" placeholder="folder name (optional)" aria-label="Repo folder name" />
          <p class="text-xs text-[var(--bros-muted)]">Clones into $BROS_HOME/data/sidecar-repos/&lt;name&gt;/ and loads that tree’s sidecars/ dir.</p>
          <div class="flex gap-2">
            <UButton size="sm" color="primary" :loading="busy === 'clone'" @click="cloneRepo">Clone</UButton>
            <UButton size="sm" color="neutral" variant="ghost" @click="repoOpen = false">Cancel</UButton>
          </div>
        </div>

        <p v-if="!sec.rows.length" class="text-sm text-[var(--bros-muted)]">None.</p>

        <div
          :class="sectionGridClass(sec.rows.length)"
          :data-sidecar-section="sec.key"
          :data-sidecar-grid="sectionTwoCol(sec.rows.length) ? 'multi' : 'single'"
        >
          <article
            v-for="s in sec.rows"
            :key="s.id"
            :data-sidecar-card="s.id"
            :data-card-layout="sectionTwoCol(sec.rows.length) ? 'compact-lg' : 'wide'"
            class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5"
          >
            <div :class="cardInnerClass(sec.rows.length)">
              <div class="min-w-0 flex-1 space-y-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="text-lg font-medium text-white">{{ s.name }}</h3>
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

                <div class="flex flex-wrap gap-1">
                  <UBadge variant="outline" :data-sidecar-src="sourceLabel(s)">{{ sourceLabel(s) }}</UBadge>
                  <UBadge v-for="iface in s.interfaces" :key="iface.type + iface.service" variant="soft">
                    {{ iface.type }}
                  </UBadge>
                </div>

                <p v-if="s.error" class="text-sm text-red-400">{{ s.error }}</p>
                <p v-else-if="s.warning" class="text-sm text-amber-300">{{ s.warning }}</p>
                <p v-if="s.disabled" class="text-sm text-[var(--bros-muted)]">Env-disabled: not autostarted. Start still works.</p>
                <p v-if="s.hostPort" class="text-xs text-[var(--bros-muted)]">Bros sidecar on :{{ s.hostPort }}</p>
              </div>

              <div :class="cardControlsClass(sec.rows.length)">
                <div v-if="sidecarApiCopyUrls(s).length" class="space-y-2">
                  <p class="text-xs font-medium uppercase tracking-wide text-[var(--bros-muted)]">API</p>
                  <div
                    v-for="ep in sidecarApiCopyUrls(s)"
                    :key="ep.url"
                    class="flex items-center gap-2 rounded-lg border border-[var(--bros-border)] bg-[var(--bros-bg)]/60 px-3 py-2"
                  >
                    <div class="min-w-0 flex-1">
                      <a
                        v-if="ep.network === 'host'"
                        :href="ep.url"
                        class="block truncate font-mono text-sm text-[var(--bros-accent)] hover:underline"
                        :title="ep.url"
                        @click.prevent="copyUrl(ep.url)"
                      >{{ ep.url }}</a>
                      <button
                        v-else
                        type="button"
                        class="block w-full truncate text-left font-mono text-sm text-white"
                        :title="ep.url"
                        @click="copyUrl(ep.url)"
                      >{{ ep.url }}</button>
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
                <div v-if="openaiEndpoints(s).length" class="space-y-2">
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

                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-if="!isCore(s)"
                    size="sm"
                    color="success"
                    variant="outline"
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
                  <UButton
                    v-if="s.editable"
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    :loading="isBusy(s.id, 'edit')"
                    @click="openEdit(s)"
                  >Edit</UButton>
                  <UButton
                    v-if="s.gitUrl || (s.source !== 'shipped' && s.source !== 'data dir')"
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    :loading="isBusy(s.id, 'update')"
                    @click="updateRepo(s)"
                  >Update</UButton>
                </div>

                <div class="flex flex-wrap items-center gap-4 text-sm">
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
            </div>

            <div v-if="editingId === s.id" class="mt-4 space-y-3">
              <UTextarea v-model="editFiles.sidecarYml" :rows="8" class="font-mono text-xs" />
              <UTextarea v-model="editFiles.composeYml" :rows="10" class="font-mono text-xs" />
              <div class="flex gap-2">
                <UButton size="sm" color="primary" :loading="isBusy(s.id, 'save')" @click="saveEdit">Save</UButton>
                <UButton size="sm" color="neutral" variant="ghost" @click="editingId = null">Cancel</UButton>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <UModal
      v-if="restartTarget"
      :open="!!restartTarget"
      title="Restart sidecar?"
      :description="restartTarget.reason"
      @update:open="(v: boolean) => { if (!v) restartTarget = null }"
    >
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="restartTarget = null">Not now</UButton>
        <UButton color="primary" :loading="!!busy" @click="confirmRestart">Restart</UButton>
      </template>
    </UModal>
  </BrosPageShell>
</template>
