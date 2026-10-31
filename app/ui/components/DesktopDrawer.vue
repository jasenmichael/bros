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
  error?: string
}

const note = ref('')
const busy = ref('')
const open = ref(false)
const touchHold = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const menu = ref<{ x: number, y: number, key: string } | null>(null)
let holdTimer = 0
let poll = 0
let suppressClick = false

const { data: drawer, refresh } = useFetch<{ library: App[] }>('/api/desktop/drawer', { key: 'desktop-drawer' })

const rows = computed(() => {
  const list = (drawer.value?.library || []).filter((app) => app.pinId || app.windows > 0)
  return [...list.filter((app) => app.windows > 0), ...list.filter((app) => !app.windows)]
})

const menuRow = computed(() => rows.value.find((row) => rowKey(row) === menu.value?.key))

function rowKey(app: App) {
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

async function run(app: App, action: 'open' | 'close' | 'focus') {
  if (busy.value) return
  busy.value = rowKey(app)
  note.value = ''
  menu.value = null
  try {
    await launchDesktop(app, action)
    await refresh()
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    busy.value = ''
  }
}

async function unpin(app: App) {
  if (!app.pinId || busy.value) return
  busy.value = rowKey(app)
  note.value = ''
  menu.value = null
  try {
    await $fetch(`/api/desktop/pins/${encodeURIComponent(app.pinId)}`, { method: 'DELETE' })
    await refresh()
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    busy.value = ''
  }
}

function openMenu(app: App, event: { clientX: number, clientY: number, preventDefault: () => void }) {
  event.preventDefault()
  menu.value = {
    x: Math.min(event.clientX, window.innerWidth - 160),
    y: Math.min(event.clientY, window.innerHeight - 132),
    key: rowKey(app),
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

function onClick(app: App) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  void run(app, app.windows > 0 ? 'focus' : 'open')
}

function show(event: PointerEvent | FocusEvent) {
  const was = open.value
  open.value = true
  if (!was && !busy.value) void refresh()
  if (event instanceof PointerEvent && event.pointerType === 'touch') touchHold.value = true
}

function hide(event: PointerEvent) {
  if (menu.value || event.pointerType === 'touch' || touchHold.value) return
  open.value = false
}

function away(event: PointerEvent) {
  const root = rootEl.value
  if (!root || root.contains(event.target as Node)) return
  touchHold.value = false
  open.value = false
  menu.value = null
}

function clearMenu() {
  menu.value = null
}

onMounted(() => {
  document.addEventListener('pointerdown', away)
  document.addEventListener('pointerdown', clearMenu)
  poll = window.setInterval(() => {
    if (!busy.value) void refresh()
  }, 4000)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', away)
  document.removeEventListener('pointerdown', clearMenu)
  window.clearTimeout(holdTimer)
  window.clearInterval(poll)
})

defineEmits<{ library: [] }>()
</script>

<template>
  <p v-if="note" class="absolute left-3 top-3 z-30 max-w-sm truncate text-xs text-amber-300">{{ note }}</p>
  <div ref="rootEl" class="absolute inset-x-0 bottom-0 z-20" @pointerleave="hide">
    <div
      class="absolute inset-x-0 bottom-0 flex justify-center px-3 pb-8 transition-transform duration-200"
      :class="open ? 'translate-y-0' : 'pointer-events-none translate-y-full'"
      :aria-hidden="open ? undefined : 'true'"
    >
      <div class="flex max-w-full items-end gap-1 overflow-x-auto rounded-2xl border border-[var(--bros-border)] bg-[#141a22]/95 px-2 py-2 shadow-lg">
        <div v-for="row in rows" :key="rowKey(row)" class="relative shrink-0">
          <button
            type="button"
            class="relative flex h-12 w-12 items-center justify-center rounded-xl hover:bg-white/10 disabled:opacity-50"
            :title="row.name"
            :aria-label="row.windows > 0 ? row.name : `Launch ${row.name}`"
            :disabled="!!busy"
            @click="onClick(row)"
            @contextmenu="openMenu(row, $event)"
            @pointerdown="holdStart(row, $event)"
            @pointerup="holdEnd"
            @pointercancel="holdEnd"
          >
            <DesktopMark :icon="row.icon" :name="row.name" />
            <span v-if="row.windows > 1" class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--bros-accent)] px-1 text-[10px] text-white">{{ row.windows }}</span>
            <span v-else-if="row.windows > 0" class="absolute bottom-1 size-1.5 rounded-full bg-[var(--bros-accent)]" />
          </button>
        </div>
        <button
          type="button"
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-white/10"
          aria-label="All apps"
          @click="$emit('library')"
        >
          <DesktopGridIcon />
        </button>
      </div>
    </div>
    <button
      type="button"
      class="relative h-6 w-full"
      aria-label="Show apps"
      @pointerenter="show"
      @pointerdown="show"
      @focus="open = true"
    />
    <Teleport to="body">
      <div
        v-if="menu && menuRow"
        class="fixed z-[80] min-w-36 overflow-hidden rounded-lg border border-[var(--bros-border)] bg-[#141a22] py-1 shadow-lg"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        @pointerdown.stop
      >
        <button v-if="menuRow.pinId" type="button" class="block w-full px-3 py-1.5 text-left text-sm text-white hover:bg-white/10" @click="unpin(menuRow)">Unpin</button>
        <button type="button" class="block w-full px-3 py-1.5 text-left text-sm text-white hover:bg-white/10" @click="run(menuRow, 'open')">New window</button>
        <button v-if="menuRow.windows > 0" type="button" class="block w-full px-3 py-1.5 text-left text-sm text-white hover:bg-white/10" @click="run(menuRow, 'close')">Close window</button>
      </div>
    </Teleport>
  </div>
</template>
