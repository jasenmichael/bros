<script setup lang="ts">
import {
  packageWebuiOpenHref,
  dockerAppCardBlocks,
  dockerAppOpenLinks,
  dockerAppTypePills,
  dockerAppWebUiLinks,
  type DockerAppCardBlock,
} from '../utils/docker-app/dockerAppHostLinks'
import { dockerAppKindLabel } from '../utils/docker-app/dockerAppSourceLabel'
import { isDockerAppBusy, isDockerAppRowBusy } from '../utils/docker-app/dockerAppBusy'

export type AppDockerRow = {
  id: string
  name: string
  description: string
  source: string
  kind: 'core' | 'addon' | 'custom'
  disabled?: boolean
  editable?: boolean
  gitUrl?: string
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
  warning?: string
  error?: string
}

export type AppPackageRow = {
  id: string
  name?: string
  description?: string
  kind: string
  tier?: 'core' | 'addon' | 'custom'
  enabled?: boolean
  forwardHost?: boolean
  navPinned?: boolean
  services?: Array<{ command: string }>
  serviceRunning?: boolean
  interfaces?: Array<{ type: string; command?: string; publish?: number; containerPort?: number; basePath?: string; bin?: string }>
}

const props = defineProps<{
  docker?: AppDockerRow | null
  pkg?: AppPackageRow | null
  layout: 'compact' | 'wide'
  open: boolean
  busy: Set<string>
  refreshing: boolean
  copiedUrl: string
  editing: boolean
  editDockerApp: string
  editCompose: string
  viaTunnel?: boolean
  version?: string
  latest?: string
  updateReady?: boolean
  rebuildLock?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  toggle: []
  run: [action: 'start' | 'stop' | 'restart']
  copy: [url: string]
  edit: []
  save: []
  'cancel-edit': []
  'update:editDockerApp': [value: string]
  'update:editCompose': [value: string]
  check: []
  'update-image': []
  'update-repo': []
  'update-package': []
  autostart: [value: boolean]
  pin: [value: boolean]
  forward: [value: boolean]
  enable: []
  disable: []
}>()

const id = computed(() => props.docker?.id || props.pkg?.id || '')

function busyOn(action: string) {
  return isDockerAppBusy(props.busy, id.value, action)
}

function rowBusy() {
  return isDockerAppRowBusy(props.busy, id.value)
}

const isCore = computed(() => props.docker?.kind === 'core')
const runnable = computed(() => {
  if (props.docker) return !isCore.value
  const pkg = props.pkg
  return !!pkg && pkg.enabled !== false && (pkg.services?.length || 0) > 0
})
const running = computed(() => props.docker ? !!props.docker.status.running : !!props.pkg?.serviceRunning)
const runError = computed(() => props.docker?.error || '')
const title = computed(() => {
  if (props.docker) return `${props.docker.name} (${dockerAppKindLabel(props.docker.source, props.docker.kind, props.docker.gitUrl)})`
  const pkg = props.pkg
  return `${pkg?.name || pkg?.id || ''} (${pkg?.tier || 'addon'})`
})
const description = computed(() => props.docker?.description || props.pkg?.description || (props.pkg ? `${props.pkg.kind} package` : ''))
const pills = computed(() => {
  if (props.docker) return dockerAppTypePills(props.docker)
  const pkg = props.pkg
  if (!pkg) return []
  return dockerAppTypePills({ name: pkg.name || pkg.id, id: pkg.id, interfaces: pkg.interfaces || [] })
})
const blocks = computed((): DockerAppCardBlock[] => {
  if (props.docker) return dockerAppCardBlocks(props.docker, { viaTunnel: props.viaTunnel })
  const pkg = props.pkg
  if (!pkg) return []
  return dockerAppCardBlocks({ name: pkg.name || pkg.id, id: pkg.id, interfaces: pkg.interfaces || [] }, { viaTunnel: props.viaTunnel })
})
const openLinks = computed(() => props.docker ? dockerAppOpenLinks(props.docker, { viaTunnel: props.viaTunnel }) : [])
const pinLinks = computed(() => props.docker ? dockerAppWebUiLinks(props.docker, { viaTunnel: props.viaTunnel }) : [])
const packageHref = computed(() => props.pkg ? packageWebuiOpenHref(props.pkg) : '')
const packagePort = computed(() => props.pkg?.interfaces?.find((row) => row.type === 'webui' && row.publish)?.publish)
const hasWebui = computed(() => (props.pkg?.interfaces || []).some((iface) => iface.type === 'webui'))
const showImageTools = computed(() => {
  const row = props.docker
  if (!row) return false
  return !(row.gitUrl || (row.source !== 'shipped' && row.source !== 'custom'))
})
const showRepoUpdate = computed(() => {
  const row = props.docker
  if (!row) return false
  return !!(row.gitUrl || (row.source !== 'shipped' && row.source !== 'custom'))
})
const packageOn = computed(() => props.pkg?.enabled !== false)
const showEnable = computed(() => !!props.pkg && props.pkg.enabled === false)
const showDisable = computed(() => !!props.pkg && packageOn.value && props.pkg.tier === 'addon')
const showPackageCheck = computed(() => !!props.pkg && packageOn.value && props.pkg.kind !== 'run')
const showPackageUpdate = computed(() => !!props.pkg && packageOn.value && (props.pkg.kind === 'run' || !!props.updateReady))
const showEdit = computed(() => !!props.docker?.editable || (!!props.pkg && (props.pkg.tier === 'custom' || !props.pkg.tier)))
const showLogs = computed(() => !!props.docker || (props.pkg?.services?.length || 0) > 0)
const logsTo = computed(() => `/apps/${id.value}/logs`)
const showToggles = computed(() => {
  if (props.docker) return !isCore.value || pinLinks.value.length > 0
  return hasWebui.value
})
const badge = computed(() => {
  if (props.docker) {
    if (props.docker.disabled) return { color: 'neutral' as const, label: 'disabled' }
    return props.docker.status.running
      ? { color: 'success' as const, label: 'running' }
      : { color: 'error' as const, label: 'stopped' }
  }
  const pkg = props.pkg
  if (!pkg || pkg.enabled === false) return { color: 'neutral' as const, label: 'disabled' }
  if (pkg.services?.length) {
    return pkg.serviceRunning
      ? { color: 'success' as const, label: 'running' }
      : { color: 'error' as const, label: 'stopped' }
  }
  return { color: 'warning' as const, label: 'enabled' }
})

function startDisabled() {
  if (runError.value) return true
  return rowBusy() && !busyOn('start')
}
function stopDisabled() {
  return rowBusy() && !busyOn('stop')
}
function restartDisabled() {
  if (runError.value) return true
  return rowBusy() && !busyOn('restart')
}
function locked(action: string) {
  if (busyOn(action)) return false
  return !!props.rebuildLock
}
</script>

<template>
  <article
    :data-app-card="id"
    :data-card-layout="layout"
    class="flex h-full flex-col rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 px-[15px] py-[8px]"
    :class="layout === 'compact' ? 'min-h-[202px]' : undefined"
  >
    <div class="flex min-w-0 flex-1 flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-medium text-white">
              {{ title }}
              <span v-if="version" class="ml-2 text-xs font-normal text-[var(--bros-muted)]">{{ version }}</span>
              <span v-if="latest" class="ml-2 text-xs font-normal text-[var(--bros-muted)]">{{ latest }}</span>
            </h3>
            <div v-if="pills.length" class="flex flex-wrap gap-1" data-app-types>
              <UBadge v-for="label in pills" :key="label" variant="soft">{{ label }}</UBadge>
            </div>
          </div>
          <p class="mt-1 text-sm text-[var(--bros-muted)]">{{ description }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <UButton
            icon="i-lucide-refresh-cw"
            size="xs"
            color="neutral"
            variant="ghost"
            :loading="refreshing"
            aria-label="Refresh app status"
            @click="emit('refresh')"
          />
          <UBadge :color="badge.color" variant="subtle">{{ badge.label }}</UBadge>
        </div>
      </div>

      <div class="mt-auto flex flex-col gap-3">
        <div class="flex flex-nowrap items-center gap-2" data-app-actions>
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <UButton
              v-if="docker?.id === 'desktop'"
              to="/terminal"
              size="sm"
              color="primary"
              variant="outline"
              class="px-1.5"
            >Terminal</UButton>
            <UButton
              v-if="showEnable"
              size="sm"
              color="primary"
              variant="soft"
              class="px-1.5"
              :loading="busyOn('enable')"
              :disabled="rowBusy() && !busyOn('enable')"
              @click="emit('enable')"
            >Enable</UButton>
            <UButton
              v-if="runnable"
              size="sm"
              color="success"
              variant="outline"
              class="px-1.5"
              :class="running && !runError ? 'bg-success/10' : undefined"
              :loading="busyOn('start')"
              :disabled="startDisabled()"
              @click="emit('run', 'start')"
            >Start</UButton>
            <UButton
              v-if="runnable"
              size="sm"
              color="error"
              variant="outline"
              class="px-1.5"
              :class="!running && !runError ? 'bg-error/10' : undefined"
              :loading="busyOn('stop')"
              :disabled="stopDisabled()"
              @click="emit('run', 'stop')"
            >Stop</UButton>
            <UButton
              v-if="runnable"
              size="sm"
              color="neutral"
              variant="outline"
              class="px-1.5"
              :loading="busyOn('restart')"
              :disabled="restartDisabled()"
              @click="emit('run', 'restart')"
            >Restart</UButton>
            <UButton
              v-for="link in openLinks"
              :key="link.to"
              size="sm"
              color="primary"
              variant="soft"
              class="px-1.5"
              :to="link.to"
              :target="link.external ? '_blank' : undefined"
            >Open {{ link.label }} (:{{ link.hostPort }})</UButton>
            <UButton
              v-if="packageHref"
              size="sm"
              color="primary"
              variant="soft"
              class="px-1.5"
              :to="packageHref"
              target="_blank"
              external
            >Open {{ pkg?.name || pkg?.id }} (:{{ packagePort }})</UButton>
            <UButton
              v-if="showLogs"
              size="sm"
              color="neutral"
              variant="ghost"
              class="px-1.5"
              :to="logsTo"
            >Logs</UButton>
            <UButton
              v-if="showEdit"
              size="sm"
              color="neutral"
              variant="ghost"
              class="px-1.5"
              :loading="busyOn('edit')"
              :disabled="!!rebuildLock || (rowBusy() && !busyOn('edit'))"
              @click="emit('edit')"
            >Edit</UButton>
            <UButton
              v-if="showDisable"
              size="sm"
              color="neutral"
              variant="ghost"
              class="px-1.5"
              :loading="busyOn('disable')"
              :disabled="!!rebuildLock || (rowBusy() && !busyOn('disable'))"
              @click="emit('disable')"
            >Disable</UButton>
            <UButton
              v-if="showImageTools"
              size="sm"
              color="neutral"
              variant="ghost"
              class="px-1.5"
              :loading="busyOn('check')"
              @click="emit('check')"
            >Check</UButton>
            <UButton
              v-if="showImageTools"
              size="sm"
              color="neutral"
              variant="ghost"
              class="px-1.5"
              :loading="busyOn('image')"
              @click="emit('update-image')"
            >Update</UButton>
            <UButton
              v-if="showRepoUpdate"
              size="sm"
              color="neutral"
              variant="ghost"
              class="px-1.5"
              :loading="busyOn('update')"
              @click="emit('update-repo')"
            >Update</UButton>
            <UButton
              v-if="showPackageCheck"
              size="sm"
              color="neutral"
              variant="ghost"
              class="px-1.5"
              :loading="busyOn('check')"
              :disabled="locked('check')"
              @click="emit('check')"
            >Check</UButton>
            <UButton
              v-if="showPackageUpdate"
              size="sm"
              color="neutral"
              variant="ghost"
              class="px-1.5"
              :loading="busyOn('update')"
              :disabled="locked('update')"
              @click="emit('update-package')"
            >Update</UButton>
          </div>
          <UButton
            class="ml-auto shrink-0"
            size="xs"
            color="neutral"
            variant="ghost"
            :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :aria-expanded="open"
            :aria-label="open ? 'Hide app details' : 'Show app details'"
            @click="emit('toggle')"
          />
        </div>
        <div v-if="showToggles" class="flex flex-wrap items-center gap-4 text-sm" data-app-toggles>
          <label v-if="docker && !isCore" class="flex items-center gap-2 text-[var(--bros-muted)]">
            <USwitch
              :model-value="docker.settings.autostart && !docker.disabled"
              :disabled="rowBusy() || docker.disabled"
              @update:model-value="emit('autostart', $event)"
            />
            Autostart
          </label>
          <label v-if="docker && pinLinks.length" class="flex items-center gap-2 text-[var(--bros-muted)]">
            <USwitch
              :model-value="docker.settings.navPinned"
              :disabled="rowBusy()"
              @update:model-value="emit('pin', $event)"
            />
            Pin in nav
          </label>
          <label v-if="pkg && hasWebui" class="flex items-center gap-2 text-[var(--bros-muted)]">
            <USwitch
              :model-value="pkg.forwardHost !== false"
              :disabled="rowBusy() || !!rebuildLock"
              @update:model-value="emit('forward', $event)"
            />
            Forward to host
          </label>
          <label v-if="pkg && hasWebui" class="flex items-center gap-2 text-[var(--bros-muted)]">
            <USwitch
              :model-value="pkg.navPinned === true"
              :disabled="rowBusy() || !!rebuildLock"
              @update:model-value="emit('pin', $event)"
            />
            Pin in nav
          </label>
        </div>
      </div>

      <div v-show="open" class="space-y-4" data-app-details>
        <p v-if="docker?.error" class="text-sm text-red-400">{{ docker.error }}</p>
        <p v-else-if="docker?.warning" class="text-sm text-amber-300">{{ docker.warning }}</p>
        <p v-if="docker?.disabled" class="text-sm text-[var(--bros-muted)]">Env-disabled: not autostarted. Start still works.</p>
        <div v-for="block in blocks" :key="block.label" class="space-y-2" :data-card-block="block.label">
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
                  @click.prevent="emit('copy', row.url)"
                >{{ row.url }}</a>
                <button
                  v-else
                  type="button"
                  class="block w-full truncate text-left font-mono text-sm text-white"
                  :title="row.url"
                  @click="emit('copy', row.url || '')"
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
              @click="emit('copy', row.url)"
            />
          </div>
        </div>
        <p v-if="docker?.id === 'desktop'" class="text-xs text-[var(--bros-muted)]">
          Terminal shell is bash. Bros does not expose bash to the host. Other app CLIs are on Terminal under Expose CLIs.
        </p>
        <div v-if="docker?.cli?.length" class="flex flex-wrap items-center gap-4 text-sm">
          <p v-for="row in docker.cli" :key="row.bin" class="text-xs text-[var(--bros-muted)]">
            {{ row.bin }}: Bros uses {{ row.source }}<span v-if="row.hostInstalled"> (host installed)</span>
          </p>
        </div>
        <div v-if="docker && editing" class="space-y-3">
          <UTextarea :model-value="editDockerApp" :rows="8" class="font-mono text-xs" @update:model-value="emit('update:editDockerApp', $event)" />
          <UTextarea :model-value="editCompose" :rows="10" class="font-mono text-xs" @update:model-value="emit('update:editCompose', $event)" />
          <div class="flex gap-2">
            <UButton size="sm" color="primary" :loading="busyOn('save')" @click="emit('save')">Save</UButton>
            <UButton size="sm" color="neutral" variant="ghost" @click="emit('cancel-edit')">Cancel</UButton>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>
