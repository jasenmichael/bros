<script setup lang="ts">
import { launchDesktop } from '../utils/desktopLaunch'

type App = {
  kind: 'terminal' | 'package' | 'docker' | 'entry'
  id: string
  name: string
  command: string
  icon: string
  pinId: string
  windows: number
}

const emit = defineEmits<{ opened: [] }>()
const note = ref('')
const busy = ref(false)
const q = ref('')
const menu = ref<{ x: number, y: number, key: string } | null>(null)
let holdTimer = 0
let suppressClick = false

const { data: drawer, refresh } = useFetch<{ library: App[] }>('/api/desktop/drawer', { key: 'desktop-drawer' })

const shown = computed(() => {
  const query = q.value.trim().toLowerCase()
  return (drawer.value?.library || []).filter((app) => !query || app.name.toLowerCase().includes(query))
})

const menuApp = computed(() => shown.value.find((app) => appKey(app) === menu.value?.key) || (drawer.value?.library || []).find((app) => appKey(app) === menu.value?.key))

function appKey(app: App) {
  return `${app.kind}:${app.id}:${app.command}`
}

function errText(err: unknown) {
  if (err && typeof err === 'object' && 'data' in err) {
    const body = (err as { data?: { statusMessage?: string, message?: string } }).data
    if (body?.message) return body.message
    if (body?.statusMessage) return body.statusMessage
  }
  return err instanceof Error ? err.message : 'Request failed'
}

async function open(app: App) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (busy.value) return
  busy.value = true
  note.value = ''
  menu.value = null
  try {
    await launchDesktop(app, 'open')
    await refresh()
    emit('opened')
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    busy.value = false
  }
}

async function pin(app: App, on: boolean) {
  if (busy.value) return
  busy.value = true
  note.value = ''
  menu.value = null
  try {
    if (on) await $fetch('/api/desktop/pins', { method: 'POST', body: { kind: app.kind, id: app.id, command: app.command } })
    else await $fetch(`/api/desktop/pins/${encodeURIComponent(app.pinId)}`, { method: 'DELETE' })
    await refresh()
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    busy.value = false
  }
}

function openMenu(app: App, event: { clientX: number, clientY: number, preventDefault: () => void }) {
  event.preventDefault()
  menu.value = {
    x: Math.min(event.clientX, window.innerWidth - 140),
    y: Math.min(event.clientY, window.innerHeight - 80),
    key: appKey(app),
  }
}

function holdStart(app: App, event: PointerEvent) {
  if (event.button !== 0) return
  window.clearTimeout(holdTimer)
  holdTimer = window.setTimeout(() => {
    suppressClick = true
    openMenu(app, event)
  }, 500)
}

function holdEnd() {
  window.clearTimeout(holdTimer)
}

function clearMenu() {
  menu.value = null
}

onMounted(() => document.addEventListener('pointerdown', clearMenu))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', clearMenu)
  window.clearTimeout(holdTimer)
})
</script>

<template>
  <div class="p-4 pb-14">
    <p v-if="note" class="mb-3 text-sm text-amber-300">{{ note }}</p>
    <div class="relative mb-4 w-full max-w-xs">
      <UIcon name="i-lucide-search" class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--bros-muted)]" aria-hidden="true" />
      <input
        v-model="q"
        type="search"
        placeholder="Type to search apps..."
        class="w-full rounded-full border border-[var(--bros-border)] bg-[#0f1419] py-2 pr-4 pl-9 text-sm text-white outline-none focus:border-[var(--bros-accent)]"
      >
    </div>
    <div class="flex flex-wrap justify-center gap-2">
      <button
        v-for="app in shown"
        :key="appKey(app)"
        type="button"
        class="flex w-[6.5rem] shrink-0 flex-col items-center gap-2 rounded-xl px-2 py-3 hover:bg-white/10 disabled:opacity-50"
        :disabled="busy"
        @click="open(app)"
        @contextmenu="openMenu(app, $event)"
        @pointerdown="holdStart(app, $event)"
        @pointerup="holdEnd"
        @pointercancel="holdEnd"
      >
        <DesktopMark :icon="app.icon" :name="app.name" />
        <span class="line-clamp-2 w-full text-center text-xs text-white">{{ app.name }}</span>
      </button>
    </div>
    <p v-if="!shown.length" class="py-8 text-center text-sm text-[var(--bros-muted)]">No apps</p>
    <Teleport to="body">
      <div
        v-if="menu && menuApp"
        class="fixed z-[80] min-w-32 overflow-hidden rounded-lg border border-[var(--bros-border)] bg-[#141a22] py-1 shadow-lg"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        @pointerdown.stop
      >
        <button v-if="menuApp.pinId" type="button" class="block w-full px-3 py-1.5 text-left text-sm text-white hover:bg-white/10" @click="pin(menuApp, false)">Unpin</button>
        <button v-else type="button" class="block w-full px-3 py-1.5 text-left text-sm text-white hover:bg-white/10" @click="pin(menuApp, true)">Pin</button>
      </div>
    </Teleport>
  </div>
</template>
