<script setup lang="ts">
import { listedPackageApp, listedSidecarApp } from '../utils/gui'

useSeoMeta({ title: 'Desktop' })

type PackGui = { id: string; name?: string; bin?: string; spec: string; enabled?: boolean; interfaces?: Array<{ type: string; command?: string; args?: string; open?: boolean }> }
type GuiRow = {
  id: string
  name: string
  disabled?: boolean
  error?: string
  interfaces: Array<{ type: string; command?: string }>
  guiSession?: boolean
}
type DrawerApp = {
  key: string
  name: string
  detail: string
  kind: 'sidecar' | 'package' | 'desktop'
  id: string
  command: string
  running: boolean
  error?: string
}

const note = ref('')
const busy = ref('')
const panel = ref(false)
const termOn = ref(false)
const streamSrc = '/desktop/view/'

const { data, refresh } = await useFetch<{ sidecars: GuiRow[] }>('/api/sidecars')
const { data: packs, refresh: refreshPacks } = await useFetch<{ packages: PackGui[] }>('/api/cli/packages')

function guiCommand(app: GuiRow) {
  return app.interfaces.find((iface) => iface.type === 'gui')?.command || ''
}

const drawerApps = computed<DrawerApp[]>(() => {
  const sidecars = (data.value?.sidecars || [])
    .filter((app) => listedSidecarApp(app) && app.interfaces.some((iface) => iface.type === 'gui'))
    .map((app) => ({
      key: app.id,
      name: app.name,
      detail: guiCommand(app),
      kind: 'sidecar' as const,
      id: app.id,
      command: guiCommand(app),
      running: Boolean(app.guiSession) && !app.error,
      error: app.error,
    }))
  const packages = (packs.value?.packages || []).filter(listedPackageApp).flatMap((pkg) =>
    (pkg.interfaces || []).filter((iface) => iface.type === 'gui' && iface.command).map((iface) => ({
      key: `${pkg.id}:${iface.command}`,
      name: pkg.name || pkg.bin || pkg.spec,
      detail: iface.command || '',
      kind: 'package' as const,
      id: pkg.id,
      command: iface.command || '',
      running: Boolean(iface.open),
    })),
  )
  const terminal: DrawerApp = {
    key: 'terminal',
    name: 'Terminal',
    detail: 'foot',
    kind: 'desktop',
    id: 'terminal',
    command: 'foot',
    running: termOn.value,
  }
  return [terminal, ...sidecars, ...packages]
})

function errText(err: unknown) {
  if (err && typeof err === 'object' && 'data' in err) {
    const body = (err as { data?: { statusMessage?: string; message?: string } }).data
    if (body?.message) return body.message
    if (body?.statusMessage) return body.statusMessage
  }
  return err instanceof Error ? err.message : 'Request failed'
}

async function openApp(app: DrawerApp) {
  if (app.error || busy.value) return
  busy.value = app.key
  note.value = ''
  try {
    if (app.kind === 'sidecar') {
      await $fetch(`/api/sidecars/${app.id}/start`, { method: 'POST', body: { gui: true } })
      await refresh()
    } else if (app.kind === 'desktop') {
      await $fetch('/api/desktop/terminal', { method: 'POST', body: { open: true } })
      termOn.value = true
    } else {
      await $fetch(`/api/apps/${app.id}/open`, { method: 'POST', body: { command: app.command } })
      await refreshPacks()
    }
    panel.value = false
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    busy.value = ''
  }
}

async function stopApp(app: DrawerApp) {
  if (busy.value) return
  busy.value = app.key
  note.value = ''
  try {
    if (app.kind === 'sidecar') {
      await $fetch(`/api/sidecars/${app.id}/stop`, { method: 'POST', body: { gui: true } })
      await refresh()
    } else if (app.kind === 'desktop') {
      await $fetch('/api/desktop/terminal', { method: 'POST', body: { open: false } })
      termOn.value = false
    } else {
      await $fetch(`/api/apps/${app.id}/close`, { method: 'POST', body: { command: app.command } })
      await refreshPacks()
    }
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--bros-border)] bg-[#141a22] px-2">
      <button
        type="button"
        class="rounded px-2 py-1 text-sm text-white hover:bg-white/10"
        :aria-expanded="panel"
        @click="panel = !panel"
      >Apps</button>
      <p v-if="note" class="min-w-0 truncate text-xs text-amber-300">{{ note }}</p>
    </div>

    <div
      v-if="panel"
      class="absolute inset-x-0 bottom-0 top-9 z-10"
      @click="panel = false"
    />

    <div
      v-if="panel"
      class="absolute left-0 top-9 z-20 max-h-[min(24rem,70%)] w-72 overflow-auto border-r border-b border-[var(--bros-border)] bg-[#141a22] shadow-lg"
      @click.stop
    >
      <p v-if="!drawerApps.length" class="px-3 py-2 text-sm text-[var(--bros-muted)]">No GUI apps yet.</p>
      <div
        v-for="app in drawerApps"
        :key="app.key"
        class="flex items-center gap-2 border-t border-[var(--bros-border)] px-3 py-2 first:border-t-0"
      >
        <button
          type="button"
          class="min-w-0 flex-1 truncate text-left text-sm text-white hover:underline disabled:opacity-50"
          :disabled="!!app.error || !!busy"
          @click="openApp(app)"
        >{{ app.name }}<span v-if="app.detail" class="ml-2 font-mono text-xs text-[var(--bros-muted)]">{{ app.detail }}</span></button>
        <button
          v-if="app.running"
          type="button"
          class="shrink-0 text-xs text-[var(--bros-muted)] hover:text-white"
          :disabled="!!busy"
          @click="stopApp(app)"
        >Stop</button>
      </div>
    </div>

    <iframe
      :src="streamSrc"
      title="Desktop"
      class="min-h-0 w-full flex-1 border-0 bg-[#141a22]"
    />
  </div>
</template>
