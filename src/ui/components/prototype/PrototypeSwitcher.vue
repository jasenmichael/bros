<script setup lang="ts">
const props = defineProps<{
  variants?: { id: string; label: string }[]
}>()

const dev = import.meta.dev
const route = useRoute()

const desktop = [
  { id: 'shelf', label: 'Shelf' },
  { id: 'sheet', label: 'Sheet' },
  { id: 'taskbar', label: 'Taskbar' },
]
const settings = [
  { id: 'rows', label: 'Rows' },
  { id: 'board', label: 'Board' },
  { id: 'detail', label: 'Detail' },
]

const queryMode = computed(() => Boolean(props.variants?.length))
const settingsRoute = computed(() => route.path.startsWith('/prototype/desktop-settings/'))
const items = computed(() => {
  if (props.variants?.length) return props.variants
  return settingsRoute.value ? settings : desktop
})
const current = computed(() => {
  if (queryMode.value) return String(route.query.variant || props.variants?.[0]?.id || '')
  return String(route.params.name || '')
})
const label = computed(() => {
  const item = items.value.find((row) => row.id === current.value)
  if (!item) return current.value
  return queryMode.value ? `${item.id} (${item.label})` : item.label
})
const modal = computed(() => route.query.as === 'modal')

function go(delta: number) {
  const list = items.value
  const index = list.findIndex((row) => row.id === current.value)
  const at = index < 0 ? (delta > 0 ? -1 : 0) : index
  const next = list[(at + delta + list.length) % list.length]
  if (!next) return
  if (queryMode.value) {
    void navigateTo({
      path: route.path,
      query: { ...route.query, variant: next.id },
    }, { replace: true })
    return
  }
  const path = settingsRoute.value
    ? `/prototype/desktop-settings/${next.id}`
    : `/prototype/desktop/${next.id}`
  void navigateTo({
    path,
    query: settingsRoute.value && modal.value ? { as: 'modal' } : {},
  }, { replace: true })
}

function setAs(nextModal: boolean) {
  void navigateTo({
    path: route.path,
    query: nextModal ? { as: 'modal' } : {},
  }, { replace: true })
}

function typing(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function onKey(event: KeyboardEvent) {
  if (!dev) return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (typing(event.target)) return
  event.preventDefault()
  go(event.key === 'ArrowRight' ? 1 : -1)
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="dev" class="fixed bottom-3 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2">
    <div class="flex items-center gap-1 rounded-full bg-white px-1 py-1 text-sm text-black shadow-lg">
      <button type="button" class="rounded-full px-2 py-1 hover:bg-black/5" aria-label="Previous" @click="go(-1)">
        <UIcon name="i-lucide-chevron-left" class="size-4" />
      </button>
      <span class="min-w-16 text-center font-medium">{{ label }}</span>
      <button type="button" class="rounded-full px-2 py-1 hover:bg-black/5" aria-label="Next" @click="go(1)">
        <UIcon name="i-lucide-chevron-right" class="size-4" />
      </button>
    </div>
    <div v-if="settingsRoute && !queryMode" class="flex overflow-hidden rounded-full bg-white text-xs text-black shadow-lg">
      <button type="button" class="px-2 py-1" :class="modal ? '' : 'bg-black text-white'" :aria-pressed="!modal" @click="setAs(false)">Page</button>
      <button type="button" class="px-2 py-1" :class="modal ? 'bg-black text-white' : ''" :aria-pressed="modal" @click="setAs(true)">Modal</button>
    </div>
  </div>
</template>
