<script setup lang="ts">
import {
  addDockerAppBusy,
  isDockerAppBusy,
  removeDockerAppBusy,
  dockerAppBusyKey,
} from '../../utils/docker-app/dockerAppBusy'
import type { CliAppDraft, CliManagerForm } from '../../components/CliAppDialog.vue'

useSeoMeta({ title: 'Apps' })

type DockerAppKind = 'core' | 'addon' | 'custom'

type DockerAppRow = {
  id: string
  name: string
  description: string
  source: string
  kind: DockerAppKind
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
  cli?: Array<{ bin: string; hostInstalled: boolean; source: 'host' | 'docker' | 'none' }>
  status: { running: boolean; services: Array<{ name: string; state: string }> }
  hostPort?: number
  warning?: string
  hasContainer?: boolean
}

type PackageRow = {
  role: 'package'
  id: string
  name?: string
  description?: string
  kind: string
  spec?: string
  args?: string
  bin?: string
  clis?: string[]
  volumes?: string[]
  tier?: 'core' | 'addon' | 'custom'
  enabled?: boolean
  forwardHost?: boolean
  navPinned?: boolean
  services?: Array<{ command: string }>
  serviceRunning?: boolean
  interfaces?: Array<{ type: string; command?: string; args?: string; containerPort?: number; publish?: number; basePath?: string }>
}

const route = useRoute()
const router = useRouter()

const { data, refresh, pending } = await useFetch<{
  docker: DockerAppRow[]
  packages: PackageRow[]
  errors: string[]
  viaTunnel?: boolean
}>('/api/apps')

const { data: pkgMeta, refresh: refreshPkg } = await useFetch<{
  managers: CliManagerForm[]
  rebuildPending?: boolean
}>('/api/cli/packages?rebuild=1')

const dockerRows = computed(() => data.value?.docker || [])
const packageRows = computed(() => data.value?.packages || [])
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
  busy.value = addDockerAppBusy(busy.value, key)
}

function clearBusy(key: string) {
  busy.value = removeDockerAppBusy(busy.value, key)
}

function isBusy(id: string, action: string) {
  return isDockerAppBusy(busy.value, id, action)
}

function hasBusy(key: string) {
  return busy.value.has(key)
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
  const key = dockerAppBusyKey(id, action)
  markBusy(key)
  actionNote.value = ''
  try {
    const res = await $fetch<{ warning?: string }>(`/api/apps/${id}/${action}`, { method: 'POST' })
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
  const key = dockerAppBusyKey(id, 'settings')
  markBusy(key)
  try {
    await $fetch(`/api/apps/${id}/settings`, { method: 'PATCH', body })
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
  configYml: '',
  composeYml: '',
})
const repoForm = ref({ url: '', name: '' })
const formError = ref('')
const editingId = ref<string | null>(null)
const editFiles = ref({ configYml: '', composeYml: '' })
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
  const id = addForm.value.id.trim().toLowerCase() || 'my-app'
  if (!addForm.value.configYml.trim()) {
    addForm.value.configYml = [
      `id: ${id}`,
      `name: ${id}`,
      'description: Additional app',
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
  const configYml = addForm.value.configYml.replace(/^id:\s*\S+/m, `id: ${id}`)
  markBusy('create')
  try {
    await $fetch('/api/apps', {
      method: 'POST',
      body: { id, configYml, composeYml: addForm.value.composeYml },
    })
    addOpen.value = false
    addForm.value = { id: '', configYml: '', composeYml: '' }
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
    await $fetch('/api/apps/from-repo', {
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

async function openEdit(s: DockerAppRow) {
  formError.value = ''
  const key = dockerAppBusyKey(s.id, 'edit')
  markBusy(key)
  try {
    const files = await $fetch<{ configYml: string; composeYml: string }>(`/api/apps/${s.id}/files`)
    editFiles.value = { configYml: files.configYml, composeYml: files.composeYml }
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
  const key = dockerAppBusyKey(id, 'save')
  markBusy(key)
  try {
    const res = await $fetch<{ composeChanged: boolean }>(`/api/apps/${id}/files`, {
      method: 'PUT',
      body: editFiles.value,
    })
    editingId.value = null
    await refresh()
    const row = data.value?.docker.find((s) => s.id === id)
    if (row?.hasContainer || row?.status.running || res.composeChanged) {
      restartTarget.value = { id, reason: 'Saved files. Restart this app to apply compose changes?' }
    }
  } catch (err: unknown) {
    formError.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (err instanceof Error ? err.message : 'Save failed')
  } finally {
    clearBusy(key)
  }
}

async function checkImage(s: DockerAppRow) {
  formError.value = ''
  const key = dockerAppBusyKey(s.id, 'check')
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

async function updateImage(s: DockerAppRow) {
  formError.value = ''
  const key = dockerAppBusyKey(s.id, 'image')
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

async function updateRepo(s: DockerAppRow) {
  formError.value = ''
  const key = dockerAppBusyKey(s.id, 'update')
  markBusy(key)
  try {
    const res = await $fetch<{ composeChanged: boolean }>(`/api/apps/${s.id}/repo`, { method: 'POST' })
    await refresh()
    if (res.composeChanged) {
      restartTarget.value = { id: s.id, reason: 'Compose changed after git pull. Restart this app?' }
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

async function enablePackage(id: string) {
  formError.value = ''
  const key = dockerAppBusyKey(id, 'enable')
  markBusy(key)
  try {
    await $fetch(`/api/apps/${id}/enable`, { method: 'POST' })
    await refresh()
    await refreshPkg()
  } catch (err: unknown) {
    formError.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (err instanceof Error ? err.message : 'Enable failed')
  } finally {
    clearBusy(key)
  }
}

async function disablePackage(id: string) {
  formError.value = ''
  const key = dockerAppBusyKey(id, 'disable')
  markBusy(key)
  try {
    await $fetch(`/api/apps/${id}/disable`, { method: 'POST' })
    await refresh()
    await refreshPkg()
  } catch (err: unknown) {
    formError.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || (err instanceof Error ? err.message : 'Disable failed')
  } finally {
    clearBusy(key)
  }
}

function installText(code: number, stderr: string | undefined, fallback: string) {
  if (code === 0) return stderr || ''
  return stderr || fallback
}

function errText(err: unknown) {
  if (err && typeof err === 'object' && 'data' in err) {
    const body = (err as { data?: { statusMessage?: string; message?: string } }).data
    if (body?.statusMessage) return body.statusMessage
    if (body?.message) return body.message
  }
  return err instanceof Error ? err.message : 'Request failed'
}

const dialogOpen = ref(false)
const editingPkg = ref<PackageRow | null>(null)
const pkgForm = ref<CliAppDraft | null>(null)
const rebuildLock = ref(false)
const versions = ref<Record<string, string>>({})
const latest = ref<Record<string, string>>({})
const updates = ref<Record<string, boolean>>({})

function cliDraftInterfaces(pkg: PackageRow): CliAppDraft['interfaces'] {
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

function openAddPackage() {
  editingPkg.value = null
  pkgForm.value = null
  actionNote.value = ''
  dialogOpen.value = true
}

function openEditPackage(pkg: PackageRow) {
  editingPkg.value = pkg
  pkgForm.value = {
    kind: pkg.kind,
    spec: pkg.spec || '',
    args: pkg.args || '',
    volumes: (pkg.volumes || []).join('\n'),
    interfaces: cliDraftInterfaces(pkg),
  }
  actionNote.value = ''
  dialogOpen.value = true
}

async function savePackage(body: CliAppDraft) {
  const id = editingPkg.value?.id
  pkgForm.value = body
  dialogOpen.value = false
  rebuildLock.value = true
  actionNote.value = ''
  try {
    const saved = id
      ? await $fetch<{ install: { code: number; stderr: string } }>(`/api/cli/packages/${id}`, { method: 'PATCH', body })
      : await $fetch<{ install: { code: number; stderr: string } }>('/api/cli/packages', { method: 'POST', body })
    actionNote.value = installText(saved.install.code, saved.install.stderr, 'Rebuild failed')
  } catch (err: unknown) {
    actionNote.value = errText(err)
    dialogOpen.value = true
  } finally {
    rebuildLock.value = false
    await refresh()
    await refreshPkg()
  }
}

async function removePackage() {
  const id = editingPkg.value?.id
  const rebuild = editingPkg.value?.kind === 'run'
  if (!id) return
  dialogOpen.value = false
  actionNote.value = ''
  if (rebuild) rebuildLock.value = true
  if (rebuild) {
    useToast().add({
      id: 'apps-rebuild',
      title: 'Rebuilding Desktop',
      description: 'Removing this app and restarting.',
      duration: 0,
    })
  }
  try {
    const saved = await $fetch<{ install: { code: number; stderr: string } }>(`/api/cli/packages/${id}`, { method: 'DELETE' })
    editingPkg.value = null
    actionNote.value = installText(saved.install.code, saved.install.stderr, 'Rebuild failed')
    if (rebuild) {
      useToast().remove('apps-rebuild')
      useToast().add({
        title: saved.install.code === 0 ? 'Apps container restarted' : 'Apps rebuild failed',
        description: installText(saved.install.code, saved.install.stderr, 'Rebuild failed') || undefined,
        color: saved.install.code !== 0 ? 'error' : saved.install.stderr ? 'warning' : 'success',
      })
    }
  } catch (err: unknown) {
    if (rebuild) useToast().remove('apps-rebuild')
    actionNote.value = errText(err)
    dialogOpen.value = true
  } finally {
    rebuildLock.value = false
    await refresh()
    await refreshPkg()
  }
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

async function setService(id: string, action: 'start' | 'stop' | 'restart') {
  const key = dockerAppBusyKey(id, action)
  markBusy(key)
  actionNote.value = ''
  try {
    await $fetch(`/api/apps/${id}/service`, { method: 'POST', body: { action } })
    await refresh()
  } catch (err: unknown) {
    actionNote.value = errText(err)
    await refresh()
  } finally {
    clearBusy(key)
  }
}

async function checkPackage(id: string) {
  const key = dockerAppBusyKey(id, 'check')
  if (rebuildLock.value || busy.value.has(key)) return
  markBusy(key)
  actionNote.value = ''
  try {
    const res = await $fetch<{ available: boolean; version?: string; latest?: string }>(`/api/apps/${id}/update`)
    if (res.version) versions.value = { ...versions.value, [id]: res.version }
    updates.value = { ...updates.value, [id]: !!res.available }
    latest.value = { ...latest.value, [id]: res.available && res.latest ? res.latest : '' }
    actionNote.value = res.available ? 'Update available' : 'Up to date'
  } catch (err: unknown) {
    actionNote.value = errText(err)
  } finally {
    clearBusy(key)
  }
}

async function updatePackage(pkg: PackageRow) {
  const key = dockerAppBusyKey(pkg.id, 'update')
  if (busy.value.has(key) || (rebuildLock.value && !busy.value.has(key))) return
  const run = pkg.kind === 'run'
  markBusy(key)
  if (run) rebuildLock.value = true
  actionNote.value = ''
  if (run) {
    useToast().add({
      id: 'apps-rebuild',
      title: 'Rebuilding Desktop',
      description: 'Updating this app and restarting.',
      duration: 0,
    })
  }
  try {
    const res = await $fetch<{ code: number; stderr: string }>(`/api/apps/${pkg.id}/update`, { method: 'POST' })
    if (res.code !== 0 || res.stderr) actionNote.value = installText(res.code, res.stderr, 'Update failed')
    if (run) {
      useToast().remove('apps-rebuild')
      useToast().add({
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
    if (run) useToast().remove('apps-rebuild')
    actionNote.value = errText(err)
  } finally {
    clearBusy(key)
    if (run) rebuildLock.value = false
    await refresh()
  }
}

async function patchPackageUi(id: string, body: { forwardHost?: boolean; navPinned?: boolean }) {
  const key = dockerAppBusyKey(id, 'settings')
  markBusy(key)
  actionNote.value = ''
  try {
    const saved = await $fetch<{ install: { code: number; stderr: string } }>(`/api/apps/${id}/ui`, { method: 'POST', body })
    if (body.forwardHost !== undefined) actionNote.value = installText(saved.install.code, saved.install.stderr, 'Forward failed')
    if (body.navPinned !== undefined) await refreshPinnedNav()
    await refresh()
  } catch (err: unknown) {
    actionNote.value = errText(err)
  } finally {
    clearBusy(key)
  }
}

async function rebuildDesktop() {
  if (rebuildLock.value) return
  rebuildLock.value = true
  actionNote.value = ''
  useToast().add({ id: 'apps-rebuild', title: 'Rebuilding Desktop', description: 'Installing run apps and swapping the container.', duration: 0 })
  try {
    const res = await $fetch<{ install: { code: number; stderr: string } }>('/api/apps/rebuild', { method: 'POST' })
    useToast().remove('apps-rebuild')
    useToast().add({
      title: res.install.code === 0 ? 'Desktop container replaced' : 'Desktop rebuild failed',
      description: installText(res.install.code, res.install.stderr, 'Rebuild failed') || undefined,
      color: res.install.code !== 0 ? 'error' : res.install.stderr ? 'warning' : 'success',
    })
  } catch (err: unknown) {
    useToast().remove('apps-rebuild')
    actionNote.value = errText(err)
  } finally {
    rebuildLock.value = false
    await refresh()
    await refreshPkg()
  }
}

const APP_TYPES = ['docker', 'npm', 'pnpm', 'bun', 'deno', 'uv', 'cargo', 'nix', 'apt', 'deb', 'run'] as const

const stateFilter = ref<'all' | 'running' | 'stopped'>('all')
const typeFilter = ref('all')
const kindFilter = ref<'all' | 'core' | 'addon' | 'custom'>('all')
const managerFilter = ref('all')
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
const managerTabs = [
  { id: 'all', label: 'All' },
  ...APP_TYPES.map((id) => ({ id, label: id })),
]

function cardKind(s: DockerAppRow): 'core' | 'addon' | 'custom' {
  if (s.kind === 'core') return 'core'
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

function packageTier(p: PackageRow): 'core' | 'addon' | 'custom' {
  if ((p.tier || 'addon') === 'core') return 'core'
  if (p.tier === 'custom') return 'custom'
  return 'addon'
}

function packageRunning(p: PackageRow) {
  return (p.services?.length || 0) > 0 && !!p.serviceRunning
}

function packageStopped(p: PackageRow) {
  return (p.services?.length || 0) > 0 && !p.serviceRunning
}

const filtered = computed(() => dockerRows.value.filter((s) => {
  if (managerFilter.value !== 'all' && managerFilter.value !== 'docker') return false
  if (stateFilter.value === 'running' && !s.status.running) return false
  if (stateFilter.value === 'stopped' && s.status.running) return false
  if (kindFilter.value !== 'all' && cardKind(s) !== kindFilter.value) return false
  if (typeFilter.value !== 'all' && !s.interfaces.some((iface) => iface.type === typeFilter.value)) return false
  return true
}))

const filteredPackages = computed(() => packageRows.value.filter((p) => {
  if (managerFilter.value !== 'all' && p.kind !== managerFilter.value) return false
  if (stateFilter.value === 'running' && !packageRunning(p)) return false
  if (stateFilter.value === 'stopped' && !packageStopped(p)) return false
  if (kindFilter.value !== 'all' && packageTier(p) !== kindFilter.value) return false
  if (typeFilter.value !== 'all' && !(p.interfaces || []).some((iface) => iface.type === typeFilter.value)) return false
  return true
}))

type SectionRow = { role: 'docker'; row: DockerAppRow } | { role: 'package'; row: PackageRow }

const sections = computed(() => {
  const groups = new Map<string, SectionRow[]>()
  for (const row of filtered.value) {
    const list = groups.get('docker') || []
    list.push({ role: 'docker', row })
    groups.set('docker', list)
  }
  for (const row of filteredPackages.value) {
    const key = row.kind || 'package'
    const list = groups.get(key) || []
    list.push({ role: 'package', row })
    groups.set(key, list)
  }
  const known = APP_TYPES.filter((id) => groups.has(id))
  const extra = [...groups.keys()].filter((id) => !APP_TYPES.includes(id as typeof APP_TYPES[number]))
  return [...known, ...extra].map((id) => ({ id, rows: groups.get(id) || [] }))
})

watch([stateFilter, typeFilter, kindFilter, managerFilter], () => {
  const q: Record<string, string> = {}
  if (stateFilter.value !== 'all') q.state = stateFilter.value
  if (typeFilter.value !== 'all') q.type = typeFilter.value
  if (kindFilter.value !== 'all') q.kind = kindFilter.value
  if (managerFilter.value !== 'all') q.manager = managerFilter.value
  router.replace({ query: q })
}, { flush: 'post' })

onMounted(() => {
  const q = route.query
  if (q.state === 'running' || q.state === 'stopped') stateFilter.value = q.state
  if (typeof q.type === 'string' && typeTabs.some((t) => t.id === q.type)) typeFilter.value = q.type as typeof typeFilter.value
  if (q.kind === 'core' || q.kind === 'addon' || q.kind === 'custom') kindFilter.value = q.kind
  if (typeof q.manager === 'string' && managerTabs.some((t) => t.id === q.manager)) managerFilter.value = q.manager
})

/** Two-up only when this section has 2+ rows. Columns follow the section container, not the viewport. */
function sectionTwoCol(count: number) {
  return count >= 2
}

function sectionGridClass(count: number) {
  return sectionTwoCol(count)
    ? 'grid items-stretch gap-4 grid-cols-1 @3xl/dockerApp:grid-cols-2'
    : 'grid gap-4 grid-cols-1'
}

function cardKey(item: SectionRow) {
  return `${item.role}:${item.row.id}`
}

function dockerOf(item: SectionRow) {
  return item.role === 'docker' ? item.row : null
}

function packageOf(item: SectionRow) {
  return item.role === 'package' ? item.row : null
}

function cardVersion(item: SectionRow) {
  if (item.role !== 'package' || item.row.enabled === false) return ''
  return versions.value[item.row.id] || ''
}

function cardLatest(item: SectionRow) {
  if (item.role !== 'package' || item.row.enabled === false) return ''
  return latest.value[item.row.id] || ''
}

function cardUpdateReady(item: SectionRow) {
  return item.role === 'package' && item.row.enabled !== false && !!updates.value[item.row.id]
}

function onRun(item: SectionRow, action: 'start' | 'stop' | 'restart') {
  if (item.role === 'docker') return act(item.row.id, action)
  return setService(item.row.id, action)
}

function onEdit(item: SectionRow) {
  if (item.role === 'docker') return openEdit(item.row)
  return openEditPackage(item.row)
}

function onCheck(item: SectionRow) {
  if (item.role === 'docker') return checkImage(item.row)
  return checkPackage(item.row.id)
}

function onUpdateImage(item: SectionRow) {
  if (item.role === 'docker') return updateImage(item.row)
}

function onUpdateRepo(item: SectionRow) {
  if (item.role === 'docker') return updateRepo(item.row)
}

function onUpdatePackage(item: SectionRow) {
  if (item.role === 'package') return updatePackage(item.row)
}

function onAutostart(item: SectionRow, value: boolean) {
  if (item.role === 'docker') return patchSettings(item.row.id, { autostart: value })
}

function onPin(item: SectionRow, value: boolean) {
  if (item.role === 'docker') return patchSettings(item.row.id, { navPinned: value })
  return patchPackageUi(item.row.id, { navPinned: value })
}

function onForward(item: SectionRow, value: boolean) {
  if (item.role === 'package') return patchPackageUi(item.row.id, { forwardHost: value })
}

function onEnable(item: SectionRow) {
  if (item.role === 'package') return enablePackage(item.row.id)
}

function onDisable(item: SectionRow) {
  if (item.role === 'package') return disablePackage(item.row.id)
}

type GlobalName = { name: string; owned: boolean }
type GlobalScan = { kind: string; names: GlobalName[]; error?: string }
const globals = ref<GlobalScan[] | null>(null)
const scanning = ref(false)
const adoptTarget = ref<{ kind: string; name: string } | null>(null)

async function scanGlobals() {
  scanning.value = true
  formError.value = ''
  actionNote.value = ''
  try {
    const res = await $fetch<{ kinds: GlobalScan[] }>('/api/cli/packages/globals')
    const rows = res.kinds.filter((row) => row.names.length || row.error)
    const errors = rows.filter((row) => row.error && !row.names.length)
    if (rows.length && errors.length === rows.length && errors.every((row) => row.error === errors[0]?.error)) {
      formError.value = errors[0]?.error || 'Scan failed'
      globals.value = []
      return
    }
    globals.value = rows
    if (!rows.length) actionNote.value = 'No global packages.'
  } catch (err: unknown) {
    formError.value = actionErrorMessage(err)
  } finally {
    scanning.value = false
  }
}

function askAdopt(kind: string, name: string) {
  adoptTarget.value = { kind, name }
}

async function confirmAdopt() {
  const target = adoptTarget.value
  if (!target) return
  adoptTarget.value = null
  const key = `global:${target.kind}:${target.name}`
  markBusy(key)
  formError.value = ''
  try {
    await $fetch('/api/cli/packages/globals', { method: 'POST', body: { kind: target.kind, spec: target.name } })
    const row = globals.value?.find((item) => item.kind === target.kind)
    const name = row?.names.find((item) => item.name === target.name)
    if (name) name.owned = true
    await refresh()
    await refreshPkg()
  } catch (err: unknown) {
    formError.value = actionErrorMessage(err)
  } finally {
    clearBusy(key)
  }
}
</script>

<template>
  <BrosPageShell title="Apps" description="Core apps boot with Bros (Whisper follows Settings). Other docker apps use Autostart or Start. A package with a service uses those same Start, Stop, and Restart buttons.">
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
    <div v-else class="@container/dockerApp space-y-4">
      <div class="flex justify-start">
        <div class="flex flex-wrap gap-2">
          <UButton size="sm" color="primary" variant="soft" @click="toggleAdd">Add app</UButton>
          <UButton size="sm" color="neutral" variant="outline" @click="openAddPackage">Add package</UButton>
          <UButton size="sm" color="neutral" variant="outline" @click="toggleRepo">From a repo</UButton>
          <UButton size="sm" color="neutral" variant="outline" :loading="scanning" @click="scanGlobals">Scan</UButton>
          <UButton v-if="pkgMeta?.rebuildPending" size="sm" color="neutral" variant="soft" :disabled="rebuildLock" @click="rebuildDesktop">Rebuild</UButton>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3" data-app-filters>
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
        <div :class="filterGroupClass" role="group" aria-label="App kind">
          <button
            v-for="opt in kindTabs"
            :key="opt.id"
            type="button"
            :class="tabOn(kindFilter === opt.id)"
            :aria-pressed="kindFilter === opt.id"
            @click="kindFilter = opt.id"
          >{{ opt.label }}</button>
        </div>
        <div :class="filterGroupClass" role="group" aria-label="Package manager">
          <button
            v-for="opt in managerTabs"
            :key="opt.id"
            type="button"
            :class="tabOn(managerFilter === opt.id)"
            :aria-pressed="managerFilter === opt.id"
            @click="managerFilter = opt.id"
          >{{ opt.label }}</button>
        </div>
      </div>
      <div v-if="globals?.length" class="space-y-1 text-sm" data-global-packages>
        <p class="text-[var(--bros-muted)]">Plain names are already apps. An Adopt control is not an app yet. Adopt writes a custom config and does not install.</p>
        <p v-for="row in globals" :key="row.kind">
          <span class="text-[var(--bros-muted)]">{{ row.kind }}: </span>
          <template v-if="row.error && !row.names.length"> {{ row.error }}</template>
          <template v-else>
            <template v-for="(item, i) in row.names" :key="item.name">
              <span v-if="i">, </span>
              <span v-if="item.owned">{{ item.name }}</span>
              <UTooltip v-else text="Adopt as a custom app. Does not install.">
                <button
                  type="button"
                  class="underline disabled:opacity-50"
                  :disabled="hasBusy(`global:${row.kind}:${item.name}`)"
                  :aria-label="`Adopt ${item.name}`"
                  @click="askAdopt(row.kind, item.name)"
                >{{ item.name }}</button>
              </UTooltip>
            </template>
          </template>
        </p>
      </div>
      <p class="text-sm text-[var(--bros-muted)]">
        Core docker has no Start, Stop, or Restart. A package with a service uses those same buttons.
      </p>

      <div v-if="addOpen" class="space-y-3 rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
          <UInput v-model="addForm.id" placeholder="id slug (not ollama / whisper / opencode / openwebui / firecrawl / firecrawl-ui)" aria-label="App id" />
          <UTextarea v-model="addForm.configYml" placeholder="config.yml" aria-label="config.yml" :rows="8" class="font-mono text-xs" />
          <UTextarea v-model="addForm.composeYml" placeholder="docker-compose.yml" aria-label="docker-compose.yml" :rows="10" class="font-mono text-xs" />
          <div class="flex gap-2">
            <UButton size="sm" color="primary" :loading="hasBusy('create')" @click="createCustom">Create</UButton>
            <UButton size="sm" color="neutral" variant="ghost" @click="() => { addOpen = false }">Cancel</UButton>
          </div>
        </div>

      <div v-if="repoOpen" class="space-y-3 rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
          <UInput v-model="repoForm.url" placeholder="https://github.com/org/apps.git" aria-label="Git repo URL" />
          <UInput v-model="repoForm.name" placeholder="folder name (optional)" aria-label="Repo folder name" />
          <p class="text-xs text-[var(--bros-muted)]">Clones into data/config/apps/&lt;name&gt;/ and loads that tree’s apps.</p>
          <div class="flex gap-2">
            <UButton size="sm" color="primary" :loading="hasBusy('clone')" @click="cloneRepo">Clone</UButton>
            <UButton size="sm" color="neutral" variant="ghost" @click="() => { repoOpen = false }">Cancel</UButton>
          </div>
        </div>

      <p v-if="!sections.length" class="text-sm text-[var(--bros-muted)]">None.</p>

      <template v-for="section in sections" :key="section.id">
        <h2
          class="text-sm font-medium text-[var(--bros-muted)]"
          :class="section.id === sections[0]?.id ? undefined : 'pt-2'"
        >{{ section.id }}</h2>
        <div
          :class="sectionGridClass(section.rows.length)"
          :data-app-section="section.id === 'docker' ? 'list' : section.id"
          :data-app-grid="section.id === 'docker' ? (sectionTwoCol(section.rows.length) ? 'multi' : 'single') : undefined"
        >
          <AppCard
            v-for="item in section.rows"
            :key="cardKey(item)"
            :docker="dockerOf(item)"
            :pkg="packageOf(item)"
            :layout="sectionTwoCol(section.rows.length) ? 'compact' : 'wide'"
            :open="cardOpen(cardKey(item))"
            :busy="busy"
            :refreshing="statusRefreshingId === item.row.id"
            :copied-url="copiedUrl"
            :editing="item.role === 'docker' && editingId === item.row.id"
            :edit-docker-app="editFiles.configYml"
            :edit-compose="editFiles.composeYml"
            :via-tunnel="data?.viaTunnel"
            :version="cardVersion(item)"
            :latest="cardLatest(item)"
            :update-ready="cardUpdateReady(item)"
            :rebuild-lock="rebuildLock"
            @refresh="refreshStatus(item.row.id)"
            @toggle="toggleCard(cardKey(item))"
            @run="onRun(item, $event)"
            @copy="copyUrl"
            @edit="onEdit(item)"
            @save="saveEdit"
            @cancel-edit="editingId = null"
            @update:edit-docker-app="editFiles.configYml = $event"
            @update:edit-compose="editFiles.composeYml = $event"
            @check="onCheck(item)"
            @update-image="onUpdateImage(item)"
            @update-repo="onUpdateRepo(item)"
            @update-package="onUpdatePackage(item)"
            @autostart="onAutostart(item, $event)"
            @pin="onPin(item, $event)"
            @forward="onForward(item, $event)"
            @enable="onEnable(item)"
            @disable="onDisable(item)"
          />
        </div>
      </template>
    </div>

    <UModal
      v-if="adoptTarget"
      :open="!!adoptTarget"
      title="Adopt as a custom app?"
      :description="adoptTarget ? `Adopt ${adoptTarget.name} as a custom ${adoptTarget.kind} app?` : ''"
      @update:open="(v: boolean) => { if (!v) adoptTarget = null }"
    >
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="() => { adoptTarget = null }">Not now</UButton>
        <UButton color="primary" :loading="adoptTarget ? hasBusy(`global:${adoptTarget.kind}:${adoptTarget.name}`) : false" @click="confirmAdopt">Adopt</UButton>
      </template>
    </UModal>
    <UModal
      v-if="restartTarget"
      :open="!!restartTarget"
      title="Restart app?"
      :description="restartTarget.reason"
      @update:open="(v: boolean) => { if (!v) restartTarget = null }"
    >
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="() => { restartTarget = null }">Not now</UButton>
        <UButton color="primary" :loading="restartTarget ? isBusy(restartTarget.id, 'restart') : false" @click="confirmRestart">Restart</UButton>
      </template>
    </UModal>
    <CliAppDialog
      v-model:open="dialogOpen"
      :editing="!!editingPkg"
      :initial="pkgForm"
      :busy="rebuildLock"
      :error="dialogOpen ? actionNote : ''"
      :managers="pkgMeta?.managers || []"
      @save="savePackage"
      @remove="removePackage"
    />
  </BrosPageShell>
</template>
