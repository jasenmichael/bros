<script setup lang="ts">
import type { CliAppDraft, CliManagerForm } from '../../components/CliAppDialog.vue'

useSeoMeta({ title: 'Apps and packages' })

type CliPackage = {
  id: string
  name?: string
  kind: CliAppDraft['kind']
  spec: string
  args?: string
  bin?: string
  clis?: string[]
  volumes?: string[]
  home?: string[]
  interfaces?: Array<{ type: string; command?: string; args?: string; containerPort?: number; publish?: number; basePath?: string }>
  tier?: 'core' | 'addon' | 'custom'
  enabled?: boolean
  services?: Array<{ command: string }>
  serviceRunning?: boolean
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
const form = ref<CliAppDraft | null>(null)
const note = ref('')
const busy = ref(false)
const pending = ref<string[]>([])
const rebuildLock = ref(false)
const versions = ref<Record<string, string>>({})
const latest = ref<Record<string, string>>({})

const { data, refresh } = await useFetch<{ packages: CliPackage[]; managers: CliManagerForm[] }>('/api/cli/packages')

function webuiOpen(pkg: CliPackage) {
  if (pkg.enabled === false) return ''
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
    home: (pkg.home || []).join('\n'),
    interfaces: cliDraftInterfaces(pkg),
  }
  note.value = ''
  dialogOpen.value = true
}

async function save(body: Omit<CliAppDraft, 'home'> & { home: string[] }) {
  const id = editing.value?.id
  form.value = { ...body, home: body.home.join('\n') }
  dialogOpen.value = false
  busy.value = true
  note.value = ''
  try {
    const saved = id
      ? await $fetch<{ packages: CliPackage[]; install: { code: number; stderr: string } }>(`/api/cli/packages/${id}`, { method: 'PATCH', body })
      : await $fetch<{ packages: CliPackage[]; install: { code: number; stderr: string } }>('/api/cli/packages', { method: 'POST', body })
    if (data.value) data.value.packages = saved.packages
    note.value = saved.install.code === 0 ? '' : (saved.install.stderr || 'Rebuild failed')
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
  return pkg.kind === 'run' || pkg.enabled === false ? '' : (versions.value[pkg.id] || '')
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
    if (res.code !== 0) note.value = res.stderr || 'Update failed'
    if (run) {
      toast.remove('apps-rebuild')
      toast.add({
        title: res.code === 0 ? 'Apps container restarted' : 'Apps rebuild failed',
        description: res.code === 0 ? undefined : (res.stderr || 'Rebuild failed'),
        color: res.code === 0 ? 'success' : 'error',
      })
    }
    if (res.code === 0) await loadVersions()
  } catch (err: unknown) {
    if (run) toast.remove('apps-rebuild')
    note.value = errText(err)
  } finally {
    pending.value = pending.value.filter((row) => row !== key)
    if (run) rebuildLock.value = false
  }
}

async function setService(id: string, start: boolean) {
  busy.value = true
  note.value = ''
  try {
    await $fetch(`/api/apps/${id}/service`, { method: 'POST', body: { action: start ? 'start' : 'stop' } })
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
    note.value = saved.install.code === 0 ? '' : (saved.install.stderr || 'Install failed')
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
    note.value = saved.install.code === 0 ? '' : (saved.install.stderr || 'Rebuild failed')
    if (rebuild) {
      toast.remove('apps-rebuild')
      toast.add({
        title: saved.install.code === 0 ? 'Apps container restarted' : 'Apps rebuild failed',
        description: saved.install.code === 0 ? undefined : (saved.install.stderr || 'Rebuild failed'),
        color: saved.install.code === 0 ? 'success' : 'error',
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
  <BrosPageShell title="Apps and packages" description="Enabled apps install when the Desktop image builds. A volume or a webui port rebuilds Desktop.">
    <div class="mb-3 flex items-center justify-between">
      <NuxtLink to="/settings" class="text-sm text-[var(--bros-muted)] underline">Settings</NuxtLink>
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
          @click="setService(pkg.id, !pkg.serviceRunning)"
        >{{ pkg.serviceRunning ? 'Stop' : 'Start' }}</UButton>
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
          size="xs"
          color="neutral"
          variant="ghost"
          :loading="rowOn(pkg.id, 'update')"
          :disabled="updateOff(pkg)"
          @click="updatePackage(pkg)"
        >Update</UButton>
        </template>
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
