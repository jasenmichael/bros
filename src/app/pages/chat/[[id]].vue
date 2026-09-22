<script setup lang="ts">
import { useChatRecents } from '../../composables/useChatRecents'
import { formatContextLabel, formatMetaStats, splitStreamBody, type ChatMetaStats } from '../../utils/chatMeta'
import { ollamaProviderDisplayName } from '../../utils/ollamaProviderLabel'

type Msg = {
  id: string
  role: string
  content: string
  modelId?: string | null
  durationMs?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
}

const route = useRoute()
const router = useRouter()
const { refreshChatRecents, conversations } = useChatRecents()

const convoId = computed(() => {
  const raw = route.params.id
  return typeof raw === 'string' && raw ? raw : ''
})

const messages = ref<Msg[]>([])
const input = ref('')
const streaming = ref('')
const streamingModelId = ref('')
const streamingStats = ref<ChatMetaStats>({})
const busy = ref(false)
const thinking = ref(false)
const streamAbort = ref<AbortController | null>(null)
const streamStartedAt = ref(0)
const liveElapsedMs = ref(0)
const providerId = ref('ollama')
const modelName = ref('llama3.2')
const lastPersistedModel = ref<string | null>(null)
const pageTitle = ref('Chat')
const loadingThread = ref(false)
const threadEl = ref<HTMLElement | null>(null)
const threadEnd = ref<HTMLElement | null>(null)
const copiedKey = ref('')
const editingId = ref('')
const editDraft = ref('')

let elapsedTimer: ReturnType<typeof setInterval> | null = null
let copiedTimer: ReturnType<typeof setTimeout> | null = null
let discardInFlight = false

useSeoMeta({ title: () => pageTitle.value })

const { data: modelsData } = await useFetch<{
  providers: Array<{
    id: string
    name: string
    kind: string
    popular?: boolean
    enabled?: boolean
    port?: number | null
    config?: Record<string, unknown>
    models?: Array<{ name: string; enabled: boolean }>
  }>
}>('/api/providers')

const orderedProviders = computed(() => {
  const rows = (modelsData.value?.providers || []).filter((p) => p.enabled !== false)
  const sidecar = rows.filter((p) => p.id === 'ollama')
  const host = rows.filter((p) => p.id === 'ollama-host')
  const popular = rows.filter((p) => p.popular)
  const rest = rows.filter((p) => p.id !== 'ollama' && p.id !== 'ollama-host' && !p.popular)
  return [...sidecar, ...host, ...popular, ...rest]
})

const providerItems = computed(() => orderedProviders.value.map((p) => ({
  label: ollamaProviderDisplayName(p),
  value: p.id,
})))

const longestProviderLabel = computed(() => {
  let longest = ''
  for (const item of providerItems.value) {
    if (item.label.length > longest.length) longest = item.label
  }
  return longest
})

const selectedProvider = computed(() => orderedProviders.value.find((p) => p.id === providerId.value))

function modelsForProvider(pid: string): string[] {
  const p = orderedProviders.value.find((row) => row.id === pid)
  if (!p) return []
  return (p.models || []).filter((m) => m.enabled !== false).map((m) => m.name)
}

const modelItems = computed(() => {
  const names = modelsForProvider(providerId.value)
  if (names.length) return names
  return modelName.value ? [modelName.value] : []
})

const pickerMenuUi = {
  itemWrapper: 'min-w-max',
  itemLabel: 'whitespace-nowrap',
}

const providerPickerUi = {
  ...pickerMenuUi,
  content: 'w-max min-w-[var(--reka-select-trigger-width)] max-w-[min(24rem,calc(100vw-1.5rem))]',
  base: 'w-full max-w-full h-auto self-start items-center',
}

const modelPickerUi = {
  ...pickerMenuUi,
  content: 'min-w-72 w-max max-w-[min(24rem,calc(100vw-1.5rem))]',
}

const modelId = computed(() => (
  modelName.value ? `${providerId.value}/${modelName.value}` : providerId.value
))

function splitModelId(id: string) {
  const ids = orderedProviders.value.map((p) => p.id).sort((a, b) => b.length - a.length)
  for (const pid of ids) {
    if (id === pid) return { providerId: pid, model: '' }
    if (id.startsWith(`${pid}/`)) return { providerId: pid, model: id.slice(pid.length + 1) }
  }
  const idx = id.indexOf('/')
  if (idx === -1) return { providerId: providerId.value || 'ollama', model: id }
  return { providerId: id.slice(0, idx), model: id.slice(idx + 1) }
}

function applyModelId(next: string) {
  const parsed = splitModelId(next)
  providerId.value = parsed.providerId
  const names = modelsForProvider(parsed.providerId)
  modelName.value = names.includes(parsed.model) ? parsed.model : (names[0] || parsed.model)
}

const { data: modelContext } = await useFetch<{ contextLength: number | null }>(
  () => `/api/providers/${providerId.value}/models/context`,
  {
    query: computed(() => ({ model: modelName.value })),
    watch: [modelId],
    lazy: true,
  },
)

const contextLabel = computed(() => {
  if (selectedProvider.value?.kind !== 'ollama') return ''
  return formatContextLabel(modelContext.value?.contextLength) || '—'
})

async function persistOpenModel(next = modelId.value) {
  if (!convoId.value || !next || next === lastPersistedModel.value) return
  await $fetch(`/api/chat/${convoId.value}`, {
    method: 'PATCH',
    body: { modelId: next },
  })
  lastPersistedModel.value = next
}

watch(providerId, (pid) => {
  const names = modelsForProvider(pid)
  if (names.length && !names.includes(modelName.value)) {
    modelName.value = names[0] || ''
  }
})

watch(modelItems, (names) => {
  if (names.length && !names.includes(modelName.value)) {
    modelName.value = names[0] || ''
  }
}, { immediate: true })

watch([providerId, orderedProviders], () => {
  const rows = orderedProviders.value
  if (!rows.length) {
    providerId.value = ''
    modelName.value = ''
    return
  }
  if (rows.some((p) => p.id === providerId.value)) return
  const first = rows[0]
  providerId.value = first.id
  const names = modelsForProvider(first.id)
  modelName.value = names[0] || ''
}, { immediate: true })

watch(modelId, (next) => {
  void persistOpenModel(next).catch(() => {})
})

watch(conversations, (rows) => {
  if (!convoId.value) return
  const row = rows.find((c) => c.id === convoId.value)
  if (row?.title) pageTitle.value = row.title
})

function startElapsed() {
  streamStartedAt.value = Date.now()
  liveElapsedMs.value = 0
  if (elapsedTimer) clearInterval(elapsedTimer)
  elapsedTimer = setInterval(() => {
    liveElapsedMs.value = Date.now() - streamStartedAt.value
  }, 100)
}

function stopElapsed() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
  if (streamStartedAt.value) {
    liveElapsedMs.value = Date.now() - streamStartedAt.value
  }
}

function applyStreamChunk(raw: string) {
  const split = splitStreamBody(raw)
  streaming.value = split.text
  if (split.stats) streamingStats.value = { ...streamingStats.value, ...split.stats }
  if (streaming.value) thinking.value = false
}

function metaLabel(stats: ChatMetaStats) {
  return formatMetaStats(stats)
}

const liveMetaLabel = computed(() => formatMetaStats({
  durationMs: streamingStats.value.durationMs ?? (busy.value ? liveElapsedMs.value : null),
  promptTokens: streamingStats.value.promptTokens,
  completionTokens: streamingStats.value.completionTokens,
}))

async function loadConversation(id: string) {
  try {
    const convo = await $fetch<{ messages: Msg[]; modelId: string; title: string }>(`/api/chat/${id}`)
    messages.value = convo.messages
    lastPersistedModel.value = convo.modelId
    applyModelId(convo.modelId)
    pageTitle.value = convo.title || 'Chat'
    streaming.value = ''
    thinking.value = false
    cancelEdit()
    await pinThreadBottom()
  } catch {
    messages.value = []
    pageTitle.value = 'Chat'
    lastPersistedModel.value = null
    await router.replace('/chat')
  }
}

function resetEmpty() {
  messages.value = []
  streaming.value = ''
  streamingModelId.value = ''
  streamingStats.value = {}
  thinking.value = false
  pageTitle.value = 'Chat'
  lastPersistedModel.value = null
  loadingThread.value = false
  stopElapsed()
}

const isThread = computed(() =>
  Boolean(convoId.value) || messages.value.length > 0 || Boolean(streaming.value) || thinking.value || loadingThread.value,
)

watch(convoId, (id) => {
  cancelEdit()
  copiedKey.value = ''
  if (id) {
    loadingThread.value = true
    void loadConversation(id).finally(() => {
      loadingThread.value = false
    })
  } else {
    resetEmpty()
  }
}, { immediate: true })

function overflowScroller(start: HTMLElement | null): HTMLElement | null {
  if (!start) return null
  let fallback: HTMLElement | null = null
  let node: HTMLElement | null = start
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') {
      if (node.scrollHeight > node.clientHeight + 1) return node
      if (!fallback) fallback = node
    }
    node = node.parentElement
  }
  return fallback || start
}

function scrollThread() {
  const thread = threadEl.value
  const scroller = overflowScroller(thread)
  if (scroller) {
    scroller.scrollTop = scroller.scrollHeight
    return
  }
  threadEnd.value?.scrollIntoView({ block: 'end' })
}

async function pinThreadBottom() {
  await nextTick()
  scrollThread()
  await nextTick()
  scrollThread()
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => scrollThread())
  }
}

watch([messages, streaming, thinking], () => {
  if (!isThread.value) return
  nextTick(scrollThread)
})

function onComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  void send()
}

function stop() {
  streamAbort.value?.abort()
}

function waitWhileBusy() {
  if (!busy.value) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const stopWatch = watch(busy, (v) => {
      if (!v) {
        stopWatch()
        resolve()
      }
    })
  })
}

async function copyRaw(key: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
  copiedKey.value = key
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    if (copiedKey.value === key) copiedKey.value = ''
  }, 1500)
}

function startEdit(m: Msg) {
  editingId.value = m.id
  editDraft.value = m.content
}

function cancelEdit() {
  editingId.value = ''
  editDraft.value = ''
}

function onEditKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
    return
  }
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  const row = messages.value.find((m) => m.id === editingId.value)
  if (row) void resendFrom(row, editDraft.value)
}

function isAbortError(e: unknown) {
  return (e instanceof DOMException && e.name === 'AbortError')
    || (e instanceof Error && e.name === 'AbortError')
}

function finalizeAssistant(usedModel: string, content: string, extra?: ChatMetaStats) {
  messages.value.push({
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    modelId: usedModel,
    durationMs: extra?.durationMs ?? streamingStats.value.durationMs ?? liveElapsedMs.value,
    promptTokens: extra?.promptTokens ?? streamingStats.value.promptTokens ?? null,
    completionTokens: extra?.completionTokens ?? streamingStats.value.completionTokens ?? null,
  })
}

async function send() {
  if (busy.value || !input.value.trim() || !providerId.value || !modelName.value) return
  const text = input.value.trim()
  input.value = ''
  await sendText(text)
}

async function sendText(text: string) {
  if (!text.trim() || !providerId.value || !modelName.value) return
  let id = convoId.value
  if (!id) {
    const convo = await $fetch<{ id: string }>('/api/chat', {
      method: 'POST',
      body: { modelId: modelId.value },
    })
    id = convo.id
    lastPersistedModel.value = modelId.value
  }
  messages.value.push({ id: crypto.randomUUID(), role: 'user', content: text })
  const usedModel = modelId.value
  const ac = new AbortController()
  streamAbort.value = ac
  busy.value = true
  thinking.value = true
  streaming.value = ''
  streamingStats.value = {}
  streamingModelId.value = usedModel
  startElapsed()
  try {
    const res = await fetch(`/api/chat/${id}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text, modelId: usedModel }),
      signal: ac.signal,
    })
    if (!res.ok || !res.body) throw new Error(await res.text())
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let raw = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      raw += decoder.decode(value, { stream: true })
      applyStreamChunk(raw)
    }
    applyStreamChunk(raw)
    finalizeAssistant(usedModel, streaming.value)
    streaming.value = ''
    streamingModelId.value = ''
    await refreshChatRecents()
    if (!convoId.value) await router.replace(`/chat/${id}`)
  } catch (e: unknown) {
    if (isAbortError(e)) {
      if (!discardInFlight && streaming.value) {
        finalizeAssistant(usedModel, streaming.value, {
          durationMs: liveElapsedMs.value,
          promptTokens: streamingStats.value.promptTokens ?? null,
          completionTokens: streamingStats.value.completionTokens ?? null,
        })
        await refreshChatRecents()
        if (!convoId.value) await router.replace(`/chat/${id}`)
      }
    } else if (!discardInFlight) {
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${e instanceof Error ? e.message : String(e)}`,
        modelId: usedModel,
      })
    }
    streaming.value = ''
  } finally {
    thinking.value = false
    streamingModelId.value = ''
    streamAbort.value = null
    stopElapsed()
    busy.value = false
  }
}

async function resendFrom(message: Msg, text: string) {
  const edited = text.trim()
  if (!edited || !providerId.value || !modelName.value) return
  const fromIndex = messages.value.findIndex((m) => m.id === message.id)
  if (fromIndex === -1) return
  discardInFlight = true
  stop()
  await waitWhileBusy()
  discardInFlight = false
  const id = convoId.value
  if (id) {
    await $fetch(`/api/chat/${id}/truncate`, {
      method: 'POST',
      body: { fromMessageId: message.id, fromIndex },
    })
  }
  messages.value = messages.value.slice(0, fromIndex)
  streaming.value = ''
  streamingModelId.value = ''
  streamingStats.value = {}
  thinking.value = false
  cancelEdit()
  await sendText(edited)
}

onUnmounted(() => {
  stopElapsed()
  streamAbort.value?.abort()
  if (copiedTimer) clearTimeout(copiedTimer)
})

defineExpose({
  busy,
  thinking,
  stop,
  streamAbort,
  orderedProviders,
  providerId,
  messages,
  copyRaw,
  resendFrom,
  editingId,
  startEdit,
  scrollThread,
  pinThreadBottom,
})
</script>

<template>
  <div
    class="bros-chat"
    :class="isThread ? 'bros-chat--thread' : 'bros-chat--empty'"
  >
    <div v-if="!isThread" class="bros-chat__hero">
      <h1 class="bros-chat__greet">What should we run?</h1>
    </div>

    <div v-else ref="threadEl" class="bros-chat__thread" aria-live="polite">
      <div
        v-for="m in messages"
        :key="m.id"
        class="bros-chat__turn"
        :class="m.role === 'user' ? 'bros-chat__turn--user' : 'bros-chat__turn--assistant'"
      >
        <div
          v-if="m.role === 'user'"
          class="bros-chat__user"
          :class="{ 'bros-chat__user--editing': editingId === m.id }"
        >
          <div
            v-if="editingId === m.id"
            class="bros-chat__bubble bros-chat__bubble--user bros-chat__bubble--edit"
          >
            <UTextarea
              v-model="editDraft"
              class="bros-chat__edit"
              :rows="2"
              :maxrows="8"
              autoresize
              variant="none"
              :ui="{ base: 'resize-none bg-transparent ring-0' }"
              @keydown="onEditKeydown"
            />
          </div>
          <div v-else class="bros-chat__bubble bros-chat__bubble--user">
            <BrosChatMarkdown :text="m.content" />
          </div>
          <div class="bros-chat__user-actions">
            <template v-if="editingId === m.id">
              <UButton size="xs" color="neutral" variant="ghost" label="Cancel" @click="cancelEdit" />
              <UButton size="xs" label="Resend" :disabled="!editDraft.trim()" @click="resendFrom(m, editDraft)" />
            </template>
            <template v-else>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :icon="copiedKey === `user:${m.id}` ? 'i-lucide-check' : 'i-lucide-copy'"
                :aria-label="copiedKey === `user:${m.id}` ? 'Copied' : 'Copy message'"
                @click="copyRaw(`user:${m.id}`, m.content)"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-pencil"
                aria-label="Edit message"
                @click="startEdit(m)"
              />
            </template>
          </div>
        </div>
        <template v-else>
          <div class="bros-chat__bubble bros-chat__bubble--assistant">
            <BrosChatMarkdown :text="m.content" />
          </div>
          <p class="bros-chat__meta">
            <span class="bros-chat__meta-id">
              ASSISTANT<span v-if="m.modelId"> · {{ m.modelId }}</span>
            </span>
            <span class="bros-chat__meta-right">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                class="bros-chat__copy"
                :icon="copiedKey === `assistant:${m.id}` ? 'i-lucide-check' : 'i-lucide-copy'"
                :aria-label="copiedKey === `assistant:${m.id}` ? 'Copied' : 'Copy reply'"
                @click="copyRaw(`assistant:${m.id}`, m.content)"
              />
              <span v-if="metaLabel(m)" class="bros-chat__meta-stats">{{ metaLabel(m) }}</span>
            </span>
          </p>
        </template>
      </div>
      <div v-if="streaming" class="bros-chat__turn bros-chat__turn--assistant">
        <div class="bros-chat__bubble bros-chat__bubble--assistant">
          <BrosChatMarkdown :text="streaming" />
        </div>
        <p class="bros-chat__meta">
          <span class="bros-chat__meta-id">
            ASSISTANT<span v-if="streamingModelId"> · {{ streamingModelId }}</span>
          </span>
          <span v-if="liveMetaLabel" class="bros-chat__meta-stats">{{ liveMetaLabel }}</span>
        </p>
      </div>
      <p v-if="thinking" class="bros-chat__thinking">thinking…</p>
      <div ref="threadEnd" />
    </div>

    <div class="bros-chat__dock">
      <div class="bros-chat__tools">
        <div class="bros-chat__tools-left">
          <div class="bros-chat__provider-wrap">
            <span class="bros-chat__provider-sizer" aria-hidden="true">{{ longestProviderLabel }}</span>
            <USelect
              v-model="providerId"
              :items="providerItems"
              size="xs"
              class="bros-chat__provider"
              :ui="providerPickerUi"
            />
          </div>
          <USelect
            v-model="modelName"
            :items="modelItems"
            size="xs"
            class="bros-chat__model"
            :ui="modelPickerUi"
          />
        </div>
        <p v-if="contextLabel" class="bros-chat__ctx">{{ contextLabel }}</p>
      </div>
      <form class="bros-chat__composer" @submit.prevent="send">
        <UTextarea
          v-model="input"
          class="bros-chat__input"
          placeholder="Message…"
          :disabled="busy"
          :rows="1"
          :maxrows="8"
          autoresize
          variant="none"
          :ui="{ base: 'resize-none bg-transparent ring-0' }"
          @keydown="onComposerKeydown"
        />
        <UButton
          v-if="!busy"
          type="submit"
          :disabled="!input.trim()"
          icon="i-lucide-arrow-up"
          aria-label="Send"
          class="bros-chat__send"
        />
        <UButton
          v-else
          type="button"
          icon="i-lucide-square"
          aria-label="Stop"
          class="bros-chat__send"
          @click="stop"
        />
      </form>
    </div>
  </div>
</template>

<style scoped>
.bros-chat {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.bros-chat--empty {
  align-items: center;
  justify-content: center;
  gap: 1.75rem;
  padding: 2rem 1.25rem 3rem;
}

.bros-chat--thread {
  overflow: hidden;
}

.bros-chat__hero {
  width: min(48rem, 100%);
  text-align: center;
}

.bros-chat__greet {
  margin: 0;
  font-size: clamp(1.5rem, 2.4vw, 2rem);
  font-weight: 550;
  letter-spacing: -0.03em;
  color: #f2f6fb;
}

.bros-chat__thread {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 1.25rem 1.25rem 0.5rem;
}

.bros-chat__turn {
  width: min(48rem, 100%);
  margin: 0 auto 1.15rem;
}

.bros-chat__turn--user {
  display: flex;
  justify-content: flex-end;
}

.bros-chat__thinking {
  width: min(48rem, 100%);
  margin: 1.25rem auto;
  text-align: center;
  font-size: 0.95rem;
  color: var(--bros-muted);
}

.bros-chat__user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: min(36rem, 85%);
}

.bros-chat__user--editing {
  width: min(36rem, 85%);
}

.bros-chat__user-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  margin-top: 0.2rem;
}

.bros-chat__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.35rem 0 0;
  font-size: 0.7rem;
  color: var(--bros-muted);
}

.bros-chat__meta-id {
  min-width: 0;
}

.bros-chat__meta-right {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  margin-left: auto;
  flex-shrink: 0;
}

.bros-chat__meta-stats {
  flex-shrink: 0;
}

.bros-chat__copy {
  min-width: 0;
}

.bros-chat__bubble {
  min-width: 0;
  max-width: 100%;
}

.bros-chat__bubble--user {
  max-width: 100%;
  padding: 0.7rem 1rem;
  border-radius: 1.25rem 1.25rem 0.4rem 1.25rem;
  background: color-mix(in srgb, var(--bros-accent) 18%, var(--bros-surface));
  color: var(--bros-text);
}

.bros-chat__edit {
  width: 100%;
}

.bros-chat__bubble--assistant {
  color: var(--bros-text);
}

.bros-chat__dock {
  width: min(48rem, 100%);
  margin: 0 auto;
  padding: 0.5rem 1.25rem 1.25rem;
  flex-shrink: 0;
}

.bros-chat--empty .bros-chat__dock {
  width: min(42rem, 100%);
}

.bros-chat__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.55rem;
}

.bros-chat__tools-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  flex: 1 1 auto;
  min-width: 0;
}

.bros-chat__provider-wrap {
  display: inline-grid;
  align-items: start;
  width: max-content;
  height: fit-content;
  max-width: 100%;
}

.bros-chat__provider-sizer {
  grid-area: 1 / 1;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
  height: 0;
  overflow: hidden;
  font-size: 0.75rem;
  line-height: 0;
  padding: 0 1.75rem 0 0.5rem;
}

:deep(.bros-chat__provider) {
  grid-area: 1 / 1;
  align-self: start;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  height: auto;
}

.bros-chat__model {
  min-width: 10rem;
  max-width: 16rem;
}

.bros-chat__ctx {
  margin: 0 0 0 auto;
  font-size: 0.7rem;
  color: var(--bros-muted);
  flex-shrink: 0;
}

.bros-chat__composer {
  display: flex;
  align-items: flex-end;
  gap: 0.55rem;
  padding: 0.45rem 0.45rem 0.45rem 1rem;
  border: 1px solid var(--bros-border);
  border-radius: 1.6rem;
  background: color-mix(in srgb, var(--bros-surface) 88%, #0a1016);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--bros-accent) 8%, transparent);
}

.bros-chat__input {
  flex: 1;
  min-width: 0;
}

.bros-chat__send {
  border-radius: 999px;
}
</style>
