<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { navRecentsScrollHints, navRecentsScrollStep } from '../../layers/theme/app/utils/navRecentsScroll'

const { conversations, refreshChatRecents } = useChatRecents()
const { iconMode, isDesktop } = useNavDock()
const route = useRoute()
const router = useRouter()

const recentsOpen = ref(true)
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const recentsEl = ref<HTMLElement | null>(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)

const compact = computed(() => iconMode.value && isDesktop.value)
const showList = computed(() => conversations.value.length > 0 && !compact.value)

watch(renamingId, async (id) => {
  if (!id) return
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
})

function isActive(id: string) {
  return route.path === `/chat/${id}`
}

function startRename(id: string, title: string) {
  renamingId.value = id
  renameDraft.value = title
}

function cancelRename() {
  renamingId.value = null
  renameDraft.value = ''
}

async function saveRename() {
  const id = renamingId.value
  const title = renameDraft.value.trim()
  if (!id) return
  if (!title) {
    cancelRename()
    return
  }
  try {
    await $fetch(`/api/chat/${id}`, {
      method: 'PATCH',
      body: { title },
    })
    await refreshChatRecents()
  } finally {
    cancelRename()
  }
}

async function removeChat(id: string) {
  await $fetch(`/api/chat/${id}`, { method: 'DELETE' })
  if (route.path === `/chat/${id}`) await router.replace('/chat')
  await refreshChatRecents()
}

function syncRecentsHints() {
  const el = recentsEl.value
  if (!el || !recentsOpen.value) {
    canScrollUp.value = false
    canScrollDown.value = false
    return
  }
  const hints = navRecentsScrollHints(el.scrollTop, el.clientHeight, el.scrollHeight)
  canScrollUp.value = hints.canScrollUp
  canScrollDown.value = hints.canScrollDown
}

function scrollRecents(dir: -1 | 1) {
  const el = recentsEl.value
  if (!el) return
  el.scrollBy({ top: dir * navRecentsScrollStep(el.clientHeight), behavior: 'smooth' })
}

watch(recentsEl, (el, _prev, onCleanup) => {
  if (!el) {
    canScrollUp.value = false
    canScrollDown.value = false
    return
  }
  const onScroll = () => syncRecentsHints()
  el.addEventListener('scroll', onScroll, { passive: true })
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncRecentsHints) : null
  ro?.observe(el)
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(syncRecentsHints) : null
  mo?.observe(el, { childList: true, subtree: true })
  window.addEventListener('resize', syncRecentsHints)
  syncRecentsHints()
  onCleanup(() => {
    el.removeEventListener('scroll', onScroll)
    ro?.disconnect()
    mo?.disconnect()
    window.removeEventListener('resize', syncRecentsHints)
  })
})

watch(recentsOpen, async () => {
  await nextTick()
  syncRecentsHints()
})

watch(() => conversations.value.length, async () => {
  await nextTick()
  syncRecentsHints()
})

function rowItems(id: string, title: string): DropdownMenuItem[] {
  return [
    {
      label: 'Rename',
      icon: 'i-lucide-pencil',
      onSelect: () => startRename(id, title),
    },
    {
      label: 'Delete',
      icon: 'i-lucide-trash',
      color: 'error',
      onSelect: () => {
        void removeChat(id)
      },
    },
  ]
}
</script>

<template>
  <ClientOnly>
  <div v-if="showList" class="bros-recents">
    <div class="bros-nav-panel__divider" role="separator" aria-label="Previous chats" />
    <button
      type="button"
      class="bros-recents__toggle"
      :aria-expanded="recentsOpen"
      @click="recentsOpen = !recentsOpen"
    >
      <span class="bros-nav-label">Previous chats</span>
      <UIcon
        :name="recentsOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="size-3.5 shrink-0"
      />
    </button>
    <button
      v-if="canScrollUp && recentsOpen"
      type="button"
      class="bros-nav-panel__recents-hint bros-nav-panel__recents-hint--up"
      aria-label="More chats above"
      @click="scrollRecents(-1)"
    >
      <UIcon name="i-lucide-chevron-up" class="size-3.5" />
    </button>
    <ul v-show="recentsOpen" ref="recentsEl" class="bros-recents__list bros-nav-panel__recents">
      <li v-for="c in conversations" :key="c.id" class="bros-recents__row">
        <form
          v-if="renamingId === c.id"
          class="bros-recents__rename"
          @submit.prevent="saveRename"
        >
          <input
            ref="renameInput"
            v-model="renameDraft"
            class="bros-recents__input"
            aria-label="Rename chat"
            @keydown.esc.prevent="cancelRename"
            @blur="saveRename"
          >
        </form>
        <template v-else>
          <NuxtLink
            :to="`/chat/${c.id}`"
            class="bros-recents__link"
            :class="{ 'bros-recents__link--active': isActive(c.id) }"
            :title="c.title"
          >
            <span class="bros-nav-label truncate">{{ c.title }}</span>
          </NuxtLink>
          <UDropdownMenu
            :items="rowItems(c.id, c.title)"
            :content="{ align: 'end', side: 'right' }"
            :ui="{ content: 'w-36' }"
          >
            <button
              type="button"
              class="bros-recents__more"
              aria-label="Chat actions"
              @click.stop
            >
              <UIcon name="i-lucide-ellipsis-vertical" class="size-3.5" />
            </button>
          </UDropdownMenu>
        </template>
      </li>
    </ul>
    <button
      v-if="canScrollDown && recentsOpen"
      type="button"
      class="bros-nav-panel__recents-hint bros-nav-panel__recents-hint--down"
      aria-label="More chats below"
      @click="scrollRecents(1)"
    >
      <UIcon name="i-lucide-chevron-down" class="size-3.5" />
    </button>
  </div>
  </ClientOnly>
</template>

<style scoped>
.bros-recents {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.bros-nav-panel__divider {
  height: 1px;
  margin: 0.35rem 0.5rem 0.65rem;
  background: #2a3544;
}

.bros-recents__toggle {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 0.15rem;
  padding: 0.35rem 0.65rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: #8b9bb0;
  font-size: 0.75rem;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.bros-recents__toggle:hover {
  color: #e8eef5;
}

.bros-recents__list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.bros-recents__list::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.bros-nav-panel__recents-hint {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  height: 1.25rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: #8b9bb0;
  cursor: pointer;
}

.bros-nav-panel__recents-hint:hover {
  color: #c5d0dc;
}

.bros-nav-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bros-recents__row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.15rem;
  margin-bottom: 0.1rem;
}

.bros-recents__link {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  padding: 0.4rem 0.55rem;
  border-radius: 0.4rem;
  color: #c5d0dc;
  text-decoration: none;
  font-size: 0.875rem;
}

.bros-recents__link:hover {
  background: #1a222c;
  color: #ffffff;
}

.bros-recents__link--active {
  background: #1e2a38;
  color: #ffffff;
  box-shadow: inset 2px 0 0 #3d9cf0;
}

.bros-recents__more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  height: 1.65rem;
  flex-shrink: 0;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: #8b9bb0;
  cursor: pointer;
}

.bros-recents__more:hover,
.bros-recents__more:focus-visible {
  background: #1a222c;
  color: #ffffff;
}

.bros-recents__rename {
  flex: 1;
  min-width: 0;
  padding: 0 0.15rem;
}

.bros-recents__input {
  width: 100%;
  padding: 0.35rem 0.5rem;
  border: 1px solid #3d9cf0;
  border-radius: 0.35rem;
  background: #1a222c;
  color: #ffffff;
  font-size: 0.875rem;
}

.bros-recents__input:focus {
  outline: none;
}
</style>
