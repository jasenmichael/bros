<script setup lang="ts">
import type { CliAppDraft, CliManagerForm } from '../../../components/CliAppDialog.vue'

useSeoMeta({ title: 'Desktop settings' })

type CliPackage = {
  id: string
  name?: string
  kind: CliAppDraft['kind']
  spec: string
  args?: string
  bin?: string
  clis?: string[]
  volumes?: string[]
  interfaces?: Array<{ type: string; command?: string; args?: string; containerPort?: number; publish?: number; basePath?: string }>
  tier?: 'core' | 'addon' | 'custom'
  enabled?: boolean
  services?: Array<{ command: string }>
  serviceRunning?: boolean
  password?: string
  forwardHost?: boolean
  navPinned?: boolean
}

function cliDraftInterfaces(pkg: CliPackage): CliAppDraft['interfaces'] {
  const rows: CliAppDraft['interfaces'] = (pkg.interfaces || []).map((row) => ({
    type: row.type as CliAppDraft['interfaces'][number]['type'],
    command: row.command || '',
    args: row.args || '',
    containerPort: row.containerPort ? String(row.containerPort) : '',
    publish: row.publish ? String(row.publish) : '',
    basePath: row.basePath || '',
  }))
  const names = [pkg.bin, ...(pkg.clis || [])].filter((name): name is string => !!name)
  const cli = rows.find((row) => row.type === 'cli')
  if (cli) {
    const listed = cli.command.split(',').map((part) => part.trim()).filter(Boolean)
    for (const name of names) if (!listed.includes(name)) listed.push(name)
    cli.command = listed.join(', ')
  } else if (names.length) {
    rows.unshift({ type: 'cli', command: names.join(', '), args: '', containerPort: '', publish: '', basePath: '' })
  }
  return rows
}

const dialogOpen = ref(false)
const editing = ref<CliPackage | null>(null)
const toast = useToast()
function installText(code: number, stderr: string | undefined, fallback: string) {
  if (code === 0) return stderr || ''
  return stderr || fallback
}
const form = ref<CliAppDraft | null>(null)
const note = ref('')
const busy = ref(false)
const pending = ref<string[]>([])
const rebuildLock = ref(false)
const versions = ref<Record<string, string>>({})
const latest = ref<Record<string, string>>({})
const updates = ref<Record<string, boolean>>({})

const { data, refresh } = await useFetch<{ packages: CliPackage[]; managers: CliManagerForm[]; rebuildPending?: boolean }>('/api/cli/packages?rebuild=1')
const { refreshPinnedNav } = usePinnedNav()

function copyText(value: string) {
  void navigator.clipboard.writeText(value)
}

function hasWebui(pkg: CliPackage) {
  return (pkg.interfaces || []).some((row) => row.type === 'webui' && row.containerPort && row.publish)
}

function webuiOpen(pkg: CliPackage) {
  if (pkg.enabled === false || pkg.forwardHost === false) return ''
  const face = (pkg.interfaces || []).find((row) => row.type === 'webui' && row.publish)
  return face?.publish ? `http://127.0.0.1:${face.publish}/` : ''
}

function cliPackageName(pkg: { id: string; name?: string; kind: string; spec: string; bin?: string; clis?: string[] }) {
  if (pkg.name) return pkg.name
  const names = [pkg.bin, ...(pkg.clis || [])].filter((name): name is string => !!name)
  if (names.length) return names.join(', ')
  return pkg.spec || pkg.id
}

const draft = computed(() => form.value)

function errText(err: unknown) {
  if (err && typeof err === 'object' && 'data' in err) {
    const body = (err as { data?: { statusMessage?: string; message?: string } }).data
    if (body?.statusMessage) return body.statusMessage
    if (body?.message) return body.message
  }
  return err instanceof Error ? err.message : 'Request failed'
}

function openAdd() {
  editing.value = null
  form.value = null
  note.value = ''
  dialogOpen.value = true
}

function openEdit(pkg: CliPackage) {
  editing.value = pkg
  form.value = {
    kind: pkg.kind,
    spec: pkg.spec,
    args: pkg.args || '',
    volumes: (pkg.volumes || []).join('\n'),
    interfaces: cliDraftInterfaces(pkg),
  }
  note.value = ''
  dialogOpen.value = true
}

async function save(body: CliAppDraft) {
  const id = editing.value?.id
  form.value = body
  dialogOpen.value = false
  busy.value = true
  note.value = ''
  try {
    const saved = id
      ? await $fetch<{ packages: CliPackage[]; install: { code: number; stderr: string } }>(`/api/cli/packages/${id}`, { method: 'PATCH', body })
      : await $fetch<{ packages: CliPackage[]; install: { code: number; stderr: string } }>('/api/cli/packages', { method: 'POST', body })
    if (data.value) data.value.packages = saved.packages
    note.value = installText(saved.install.code, saved.install.stderr, 'Rebuild failed')
  } catch (err: unknown) {
    note.value = errText(err)
    dialogOpen.value = true
  } finally {
    busy.value = false
    await refresh()
  }
}

function rowOn(id: string, action: 'check' | 'update') {
  return pending.value.includes(`${id}:${action}`)
}

function updateOff(pkg: CliPackage) {
  if (rowOn(pkg.id, 'update')) return false
  if (busy.value || rebuildLock.value) return true
  return pkg.kind === 'run' && pending.value.some((key) => key.endsWith(':update'))
}

async function loadVersions() {
  try {
    const res = await $fetch<{ versions: { id: string; version: string }[] }>('/api/apps/versions')
    const next = { ...versions.value }
    for (const row of res.versions || []) if (row.version) next[row.id] = row.version
    versions.value = next
  } catch {
    // Desktop down: no version text
  }
}

onMounted(() => { void loadVersions() })

function labelVersion(pkg: CliPackage) {
  return pkg.enabled === false ? '' : (versions.value[pkg.id] || '')
}

function labelLatest(pkg: CliPackage) {
  return pkg.enabled === false ? '' : (latest.value[pkg.id] || '')
}

async function checkPackage(id: string) {
  const key = `${id}:check`
  if (busy.value || rebuildLock.value || pending.value.includes(key)) return
  pending.value = [...pending.value, key]
  note.value = ''
  try {
    const res = await $fetch<{ available: boolean; version?: string; latest?: string }>(`/api/apps/${id}/update`)
    if (res.version) versions.value = { ...versions.value, [id]: res.version }
    updates.value = { ...updates.value, [id]: !!res.available }
    latest.value = { ...latest.value, [id]: res.available && res.latest ? res.latest : '' }
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    pending.value = pending.value.filter((row) => row !== key)
  }
}

async function updatePackage(pkg: CliPackage) {
  const key = `${pkg.id}:update`
  if (pending.value.includes(key) || updateOff(pkg)) return
  const run = pkg.kind === 'run'
  pending.value = [...pending.value, key]
  if (run) rebuildLock.value = true
  note.value = ''
  if (run) {
    toast.add({
      id: 'apps-rebuild',
      title: 'Rebuilding Desktop',
      description: 'Updating this app and restarting.',
      duration: 0,
    })
  }
  try {
    const res = await $fetch<{ code: number; stderr: string }>(`/api/apps/${pkg.id}/update`, { method: 'POST' })
    if (res.code !== 0 || res.stderr) note.value = installText(res.code, res.stderr, 'Update failed')
    if (run) {
      toast.remove('apps-rebuild')
      toast.add({
        title: res.code === 0 ? 'Apps container restarted' : 'Apps rebuild failed',
        description: installText(res.code, res.stderr, 'Rebuild failed') || undefined,
        color: res.code !== 0 ? 'error' : res.stderr ? 'warning' : 'success',
      })
    }
    if (res.code === 0) {
      await loadVersions()
      latest.value = { ...latest.value, [pkg.id]: '' }
      updates.value = { ...updates.value, [pkg.id]: false }
    }
  } catch (err: unknown) {
    if (run) toast.remove('apps-rebuild')
    note.value = errText(err)
  } finally {
    pending.value = pending.value.filter((row) => row !== key)
    if (run) rebuildLock.value = false
  }
}

async function setService(id: string, action: 'start' | 'stop' | 'restart') {
  busy.value = true
  note.value = ''
  try {
    await $fetch(`/api/apps/${id}/service`, { method: 'POST', body: { action } })
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    busy.value = false
    await refresh()
  }
}

async function patchUi(id: string, body: { forwardHost?: boolean; navPinned?: boolean }) {
  busy.value = true
  note.value = ''
  try {
    const saved = await $fetch<{ packages: CliPackage[]; install: { code: number; stderr: string } }>(`/api/apps/${id}/ui`, { method: 'POST', body })
    if (data.value) data.value.packages = saved.packages
    if (body.forwardHost !== undefined) note.value = installText(saved.install.code, saved.install.stderr, 'Forward failed')
    if (body.navPinned !== undefined) await refreshPinnedNav()
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    busy.value = false
    await refresh()
  }
}

async function rebuildDesktop() {
  if (busy.value || rebuildLock.value) return
  busy.value = true
  rebuildLock.value = true
  note.value = ''
  toast.add({ id: 'apps-rebuild', title: 'Rebuilding Desktop', description: 'Installing run apps and swapping the container.', duration: 0 })
  try {
    const res = await $fetch<{ install: { code: number; stderr: string } }>('/api/apps/rebuild', { method: 'POST' })
    toast.remove('apps-rebuild')
    toast.add({
      title: res.install.code === 0 ? 'Desktop container replaced' : 'Desktop rebuild failed',
      description: installText(res.install.code, res.install.stderr, 'Rebuild failed') || undefined,
      color: res.install.code !== 0 ? 'error' : res.install.stderr ? 'warning' : 'success',
    })
  } catch (err: unknown) {
    toast.remove('apps-rebuild')
    note.value = errText(err)
  } finally {
    busy.value = false
    rebuildLock.value = false
    await refresh()
  }
}

async function disablePackage(id: string) {
  busy.value = true
  note.value = ''
  try {
    const saved = await $fetch<{ packages: CliPackage[]; install: { code: number; stderr: string } }>(`/api/apps/${id}/disable`, { method: 'POST' })
    if (data.value) data.value.packages = saved.packages
    note.value = installText(saved.install.code, saved.install.stderr, 'Disable failed')
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    busy.value = false
    await refresh()
  }
}

async function enablePackage(id: string) {
  busy.value = true
  note.value = ''
  try {
    const saved = await $fetch<{ packages: CliPackage[]; install: { code: number; stderr: string } }>(`/api/apps/${id}/enable`, { method: 'POST' })
    if (data.value) data.value.packages = saved.packages
    note.value = installText(saved.install.code, saved.install.stderr, 'Install failed')
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    busy.value = false
    await refresh()
  }
}

async function removePackage() {
  const id = editing.value?.id
  const rebuild = editing.value?.kind === 'run'
  if (!id) return
  dialogOpen.value = false
  busy.value = true
  note.value = ''
  if (rebuild) {
    toast.add({
      id: 'apps-rebuild',
      title: 'Rebuilding Desktop',
      description: 'Removing this app and restarting.',
      duration: 0,
    })
  }
  try {
    const saved = await $fetch<{ packages: CliPackage[]; install: { code: number; stderr: string; rebuild?: boolean } }>(`/api/cli/packages/${id}`, {
      method: 'DELETE',
    })
    if (data.value) data.value.packages = saved.packages
    editing.value = null
    note.value = installText(saved.install.code, saved.install.stderr, 'Rebuild failed')
    if (rebuild) {
      toast.remove('apps-rebuild')
      toast.add({
        title: saved.install.code === 0 ? 'Apps container restarted' : 'Apps rebuild failed',
        description: installText(saved.install.code, saved.install.stderr, 'Rebuild failed') || undefined,
        color: saved.install.code !== 0 ? 'error' : saved.install.stderr ? 'warning' : 'success',
      })
    }
  } catch (err: unknown) {
    if (rebuild) toast.remove('apps-rebuild')
    note.value = errText(err)
    dialogOpen.value = true
  } finally {
    busy.value = false
    await refresh()
  }
}
</script>

<template>
  <BrosPageShell title="Desktop settings" description="Apps on the Desktop image, and launchers pinned to the Drawer.">
    <NuxtLink to="/settings" class="text-sm text-[var(--bros-muted)] underline">Settings</NuxtLink>
    <h2 class="mb-2 mt-4 text-lg font-medium text-white">Apps</h2>
    <DesktopAppsBoard />
    <div class="mb-3 mt-8 flex items-center justify-end gap-2">
      <UButton v-if="data?.rebuildPending" size="sm" color="neutral" variant="soft" :disabled="busy || rebuildLock" @click="rebuildDesktop">Rebuild</UButton>
      <UButton size="sm" icon="i-lucide-plus" :disabled="busy" @click="openAdd">Add app</UButton>
    </div>
    <p v-if="note" class="mb-3 text-sm text-amber-300">{{ note }}</p>
    <p v-if="!(data?.packages || []).length" class="text-sm text-[var(--bros-muted)]">No apps yet.</p>
    <ul class="space-y-2">
      <li
        v-for="pkg in data?.packages || []"
        :key="pkg.id"
        class="flex items-center justify-between gap-3 rounded-lg border border-[var(--bros-border)] px-3 py-2"
      >
        <span class="min-w-0 truncate font-mono text-sm text-white">
          {{ cliPackageName(pkg) }}
          <span v-if="labelVersion(pkg)" class="ml-2 text-xs text-[var(--bros-muted)]">{{ labelVersion(pkg) }}</span>
          <span v-if="labelLatest(pkg)" class="ml-2 text-xs text-[var(--bros-muted)]">{{ labelLatest(pkg) }}</span>
          <span v-if="pkg.tier" class="ml-2 text-xs text-[var(--bros-muted)]">{{ pkg.tier }}</span>
          <span v-if="pkg.enabled === false" class="ml-2 text-xs text-[var(--bros-muted)]">off</span>
        </span>
        <span class="flex gap-1">
        <a
          v-if="webuiOpen(pkg)"
          :href="webuiOpen(pkg)"
          class="text-xs text-[var(--bros-accent)] underline-offset-2 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >Open</a>
        <button
          v-if="pkg.password"
          type="button"
          class="font-mono text-xs text-white"
          @click="copyText(pkg.password || '')"
        >{{ pkg.password }}</button>
        <UButton
          v-if="pkg.enabled === false"
          size="xs"
          :disabled="busy"
          @click="enablePackage(pkg.id)"
        >Enable</UButton>
        <template v-else>
        <UButton
          v-if="pkg.services?.length"
          size="xs"
          :disabled="busy"
          @click="setService(pkg.id, pkg.serviceRunning ? 'stop' : 'start')"
        >{{ pkg.serviceRunning ? 'Stop' : 'Start' }}</UButton>
        <UButton
          v-if="pkg.services?.length"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="busy"
          @click="setService(pkg.id, 'restart')"
        >Restart</UButton>
        <UButton
          v-if="pkg.kind !== 'run'"
          size="xs"
          color="neutral"
          variant="ghost"
          :loading="rowOn(pkg.id, 'check')"
          :disabled="busy || rebuildLock"
          @click="checkPackage(pkg.id)"
        >Check</UButton>
        <UButton
          v-if="pkg.kind === 'run' || updates[pkg.id]"
          size="xs"
          color="neutral"
          variant="ghost"
          :loading="rowOn(pkg.id, 'update')"
          :disabled="updateOff(pkg)"
          @click="updatePackage(pkg)"
        >Update</UButton>
        <UButton
          v-if="pkg.tier === 'addon'"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="busy"
          @click="disablePackage(pkg.id)"
        >Disable</UButton>
        </template>
        <label v-if="hasWebui(pkg)" class="flex items-center gap-1 text-xs text-[var(--bros-muted)]">
          <USwitch :model-value="pkg.forwardHost !== false" :disabled="busy" @update:model-value="(v: boolean) => patchUi(pkg.id, { forwardHost: v })" />
          Forward to host
        </label>
        <label v-if="hasWebui(pkg)" class="flex items-center gap-1 text-xs text-[var(--bros-muted)]">
          <USwitch :model-value="pkg.navPinned === true" :disabled="busy" @update:model-value="(v: boolean) => patchUi(pkg.id, { navPinned: v })" />
          Pin in nav
        </label>
        <UButton
          v-if="pkg.services?.length"
          size="xs"
          color="neutral"
          variant="ghost"
          :to="`/settings/desktop/${pkg.id}/logs`"
        >Logs</UButton>
        <UButton
          v-if="pkg.tier === 'custom' || !pkg.tier"
          icon="i-lucide-pencil"
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="`Edit ${cliPackageName(pkg)}`"
          :disabled="busy"
          @click="openEdit(pkg)"
        />
        </span>
      </li>
    </ul>
    <p class="mt-4 text-xs text-[var(--bros-muted)]">
      Each custom app is <span class="font-mono">apps/&lt;label&gt;/config.yml</span>. Core apps stay enabled. An addon stays off until Enable. A cli interface is on the Desktop PATH.
    </p>
    <CliAppDialog
      v-model:open="dialogOpen"
      :editing="!!editing"
      :initial="draft"
      :busy="busy"
      :error="dialogOpen ? note : ''"
      :managers="data?.managers || []"
      @save="save"
      @remove="removePackage"
    />
  </BrosPageShell>
</template>
