<script setup lang="ts">
import { useChatRecents } from '../../composables/useChatRecents'
import { formatContextLabel, formatMetaStats, splitStreamBody, type ChatMetaStats } from '../../utils/chatMeta'

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
const threadEnd = ref<HTMLElement | null>(null)

let elapsedTimer: ReturnType<typeof setInterval> | null = null

useSeoMeta({ title: () => pageTitle.value })

const { data: modelsData } = await useFetch<{
  providers: Array<{ id: string; name: string; kind: string; popular?: boolean; enabled?: boolean }>
  ollamaModelsByProvider: Record<string, Array<{ id: string; name: string }>>
  openaiModelsByProvider: Record<string, string[]>
}>('/api/models')

const orderedProviders = computed(() => {
  const rows = (modelsData.value?.providers || []).filter((p) => p.enabled !== false)
  const sidecar = rows.filter((p) => p.id === 'ollama')
  const host = rows.filter((p) => p.id === 'ollama-host')
  const popular = rows.filter((p) => p.popular)
  const rest = rows.filter((p) => p.id !== 'ollama' && p.id !== 'ollama-host' && !p.popular)
  return [...sidecar, ...host, ...popular, ...rest]
})

const providerItems = computed(() => orderedProviders.value.map((p) => ({
  label: p.name,
  value: p.id,
})))

const selectedProvider = computed(() => orderedProviders.value.find((p) => p.id === providerId.value))

function modelsForProvider(pid: string): string[] {
  const p = orderedProviders.value.find((row) => row.id === pid)
  if (!p) return []
  if (p.kind === 'ollama') {
    return (modelsData.value?.ollamaModelsByProvider?.[pid] || []).map((m) => m.name)
  }
  return modelsData.value?.openaiModelsByProvider?.[pid] || []
}

const modelItems = computed(() => {
  const names = modelsForProvider(providerId.value)
  if (names.length) return names
  return modelName.value ? [modelName.value] : []
})

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
  '/api/models/context',
  {
    query: computed(() => ({ modelId: modelId.value })),
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
  } catch {
    messages.value = []
    pageTitle.value = 'Chat'
    lastPersistedModel.value = null
    await navigateTo('/chat', { replace: true })
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
  if (id) {
    loadingThread.value = true
    void loadConversation(id).finally(() => {
      loadingThread.value = false
    })
  } else {
    resetEmpty()
  }
}, { immediate: true })

function scrollThread() {
  threadEnd.value?.scrollIntoView({ block: 'end' })
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
  let id = convoId.value
  if (!id) {
    const convo = await $fetch<{ id: string }>('/api/chat', {
      method: 'POST',
      body: { modelId: modelId.value },
    })
    id = convo.id
    lastPersistedModel.value = modelId.value
  }
  const text = input.value.trim()
  input.value = ''
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
    if (!convoId.value) await navigateTo(`/chat/${id}`, { replace: true })
  } catch (e: unknown) {
    if (isAbortError(e)) {
      if (streaming.value) {
        finalizeAssistant(usedModel, streaming.value, {
          durationMs: liveElapsedMs.value,
          promptTokens: streamingStats.value.promptTokens ?? null,
          completionTokens: streamingStats.value.completionTokens ?? null,
        })
        await refreshChatRecents()
        if (!convoId.value) await navigateTo(`/chat/${id}`, { replace: true })
      }
    } else {
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

onUnmounted(() => {
  stopElapsed()
  streamAbort.value?.abort()
})

defineExpose({ busy, thinking, stop, streamAbort, orderedProviders, providerId })
</script>

<template>
  <div
    class="bros-chat"
    :class="isThread ? 'bros-chat--thread' : 'bros-chat--empty'"
  >
    <div v-if="!isThread" class="bros-chat__hero">
      <h1 class="bros-chat__greet">What should we run?</h1>
    </div>

    <div v-else class="bros-chat__thread" aria-live="polite">
      <div
        v-for="m in messages"
        :key="m.id"
        class="bros-chat__turn"
        :class="m.role === 'user' ? 'bros-chat__turn--user' : 'bros-chat__turn--assistant'"
      >
        <p
          v-if="m.role === 'assistant'"
          class="bros-chat__meta"
        >
          <span class="bros-chat__meta-id">
            ASSISTANT<span v-if="m.modelId"> · {{ m.modelId }}</span>
          </span>
          <span v-if="metaLabel(m)" class="bros-chat__meta-stats">{{ metaLabel(m) }}</span>
        </p>
        <div class="bros-chat__bubble" :class="m.role === 'user' ? 'bros-chat__bubble--user' : 'bros-chat__bubble--assistant'">
          <BrosChatMarkdown :text="m.content" />
        </div>
      </div>
      <div v-if="streaming" class="bros-chat__turn bros-chat__turn--assistant">
        <p class="bros-chat__meta">
          <span class="bros-chat__meta-id">
            ASSISTANT<span v-if="streamingModelId"> · {{ streamingModelId }}</span>
          </span>
          <span v-if="liveMetaLabel" class="bros-chat__meta-stats">{{ liveMetaLabel }}</span>
        </p>
        <div class="bros-chat__bubble bros-chat__bubble--assistant">
          <BrosChatMarkdown :text="streaming" />
        </div>
      </div>
      <p v-if="thinking" class="bros-chat__thinking">thinking…</p>
      <div ref="threadEnd" />
    </div>

    <div class="bros-chat__dock">
      <div class="bros-chat__tools">
        <div class="bros-chat__tools-left">
          <USelect v-model="providerId" :items="providerItems" size="xs" class="bros-chat__provider" />
          <USelect v-model="modelName" :items="modelItems" size="xs" class="bros-chat__model" />
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

.bros-chat__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0 0 0.35rem;
  font-size: 0.7rem;
  color: var(--bros-muted);
}

.bros-chat__meta-id {
  min-width: 0;
}

.bros-chat__meta-stats {
  flex-shrink: 0;
  margin-left: auto;
}

.bros-chat__bubble {
  min-width: 0;
  max-width: 100%;
}

.bros-chat__bubble--user {
  max-width: min(36rem, 85%);
  padding: 0.7rem 1rem;
  border-radius: 1.25rem 1.25rem 0.4rem 1.25rem;
  background: color-mix(in srgb, var(--bros-accent) 18%, var(--bros-surface));
  color: var(--bros-text);
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
  min-width: 0;
}

.bros-chat__provider {
  min-width: 9rem;
  max-width: 14rem;
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
