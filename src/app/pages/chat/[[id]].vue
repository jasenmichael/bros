<script setup lang="ts">
import { useChatRecents } from '../../composables/useChatRecents'

type Msg = { id: string; role: string; content: string; modelId?: string | null }

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
const busy = ref(false)
const modelId = ref('ollama/llama3.2')
const lastPersistedModel = ref<string | null>(null)
const pendingSource = ref<'host' | 'sidecar' | null>(null)
const pageTitle = ref('Chat')
const loadingThread = ref(false)
const threadEnd = ref<HTMLElement | null>(null)

useSeoMeta({ title: () => pageTitle.value })

const { data: modelsData, refresh: refreshModels } = await useFetch<{
  ollamaModels: Array<{ id: string }>
  providers: Array<{ id: string; kind: string; config?: Record<string, unknown> }>
  ollamaSource?: 'host' | 'sidecar'
  hostOllama?: { port: number; version: string } | null
  sidecarPublish?: number
}>('/api/models')

const ollama = computed(() => modelsData.value?.providers.find((p) => p.id === 'ollama'))
const chatSource = computed(() => {
  if (pendingSource.value) return pendingSource.value
  const mode = ollama.value?.config?.mode as string | undefined
  if (mode === 'host' || mode === 'sidecar') return mode
  return modelsData.value?.ollamaSource || 'sidecar'
})

function pickValidModelId(current: string, available: string[]) {
  if (available.includes(current)) return current
  return available[0] || current
}

async function persistOpenModel(next = modelId.value) {
  if (!convoId.value || !next || next === lastPersistedModel.value) return
  await $fetch(`/api/chat/${convoId.value}`, {
    method: 'PATCH',
    body: { modelId: next },
  })
  lastPersistedModel.value = next
}

async function setChatSource(mode: 'host' | 'sidecar') {
  if (chatSource.value === mode) return
  pendingSource.value = mode
  try {
    await $fetch('/api/models/providers', {
      method: 'POST',
      body: {
        id: 'ollama',
        name: 'Ollama',
        kind: 'ollama',
        baseUrl: mode === 'sidecar'
          ? 'http://ollama:11434'
          : (modelsData.value?.hostOllama
            ? `http://host.docker.internal:${modelsData.value.hostOllama.port}`
            : 'http://host.docker.internal:11434'),
        config: { ...(ollama.value?.config || {}), mode },
      },
    })
    await refreshModels()
    modelId.value = pickValidModelId(modelId.value, modelOptions.value)
    await persistOpenModel()
  } finally {
    pendingSource.value = null
  }
}

const modelOptions = computed(() => {
  const opts = (modelsData.value?.ollamaModels || []).map((m) => m.id)
  for (const p of modelsData.value?.providers || []) {
    if (p.kind === 'openai') opts.push(`${p.id}/gpt-4o`)
    if (p.kind === 'anthropic') opts.push(`${p.id}/claude-3-5-sonnet-latest`)
  }
  return opts.length ? opts : ['ollama/llama3.2']
})

watch(modelOptions, (opts) => {
  modelId.value = pickValidModelId(modelId.value, opts)
}, { immediate: true })

watch(modelId, (next) => {
  void persistOpenModel(next).catch(() => {})
})

watch(conversations, (rows) => {
  if (!convoId.value) return
  const row = rows.find((c) => c.id === convoId.value)
  if (row?.title) pageTitle.value = row.title
})

async function loadConversation(id: string) {
  try {
    const convo = await $fetch<{ messages: Msg[]; modelId: string; title: string }>(`/api/chat/${id}`)
    messages.value = convo.messages
    lastPersistedModel.value = convo.modelId
    modelId.value = pickValidModelId(convo.modelId, modelOptions.value)
    pageTitle.value = convo.title || 'Chat'
    streaming.value = ''
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
  pageTitle.value = 'Chat'
  lastPersistedModel.value = null
  loadingThread.value = false
}

const isThread = computed(() =>
  Boolean(convoId.value) || messages.value.length > 0 || Boolean(streaming.value) || loadingThread.value,
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

watch([messages, streaming], () => {
  if (!isThread.value) return
  nextTick(scrollThread)
})

function onComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  void send()
}

async function send() {
  if (!input.value.trim()) return
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
  busy.value = true
  streaming.value = ''
  streamingModelId.value = usedModel
  try {
    const res = await fetch(`/api/chat/${id}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text, modelId: usedModel }),
    })
    if (!res.ok || !res.body) throw new Error(await res.text())
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      streaming.value += decoder.decode(value, { stream: true })
    }
    messages.value.push({ id: crypto.randomUUID(), role: 'assistant', content: streaming.value, modelId: usedModel })
    streaming.value = ''
    streamingModelId.value = ''
    await refreshChatRecents()
    if (!convoId.value) await navigateTo(`/chat/${id}`, { replace: true })
  } catch (e: unknown) {
    messages.value.push({ id: crypto.randomUUID(), role: 'assistant', content: `Error: ${e instanceof Error ? e.message : String(e)}`, modelId: usedModel })
    streaming.value = ''
  } finally {
    streamingModelId.value = ''
    busy.value = false
  }
}
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
          ASSISTANT<span v-if="m.modelId"> · {{ m.modelId }}</span>
        </p>
        <div class="bros-chat__bubble" :class="m.role === 'user' ? 'bros-chat__bubble--user' : 'bros-chat__bubble--assistant'">
          <BrosChatMarkdown :text="m.content" />
        </div>
      </div>
      <div v-if="streaming" class="bros-chat__turn bros-chat__turn--assistant">
        <p class="bros-chat__meta">
          ASSISTANT<span v-if="streamingModelId"> · {{ streamingModelId }}</span>
        </p>
        <div class="bros-chat__bubble bros-chat__bubble--assistant">
          <BrosChatMarkdown :text="streaming" />
        </div>
      </div>
      <div ref="threadEnd" />
    </div>

    <div class="bros-chat__dock">
      <div class="bros-chat__tools">
        <div v-if="modelsData?.hostOllama" class="bros-chat__sources">
          <UButton
            size="xs"
            :variant="chatSource === 'host' ? 'solid' : 'ghost'"
            :color="chatSource === 'host' ? 'primary' : 'neutral'"
            @click="setChatSource('host')"
          >
            Host :{{ modelsData.hostOllama.port }}
          </UButton>
          <UButton
            size="xs"
            :variant="chatSource === 'sidecar' ? 'solid' : 'ghost'"
            :color="chatSource === 'sidecar' ? 'primary' : 'neutral'"
            @click="setChatSource('sidecar')"
          >
            Sidecar :{{ modelsData.sidecarPublish || 11435 }}
          </UButton>
        </div>
        <USelect v-model="modelId" :items="modelOptions" size="xs" class="bros-chat__model" />
      </div>
      <p v-if="chatSource === 'host'" class="bros-chat__host-note">
        Chat and pull write to the host Ollama disk, not $BROS_DIR/data/ollama.
      </p>
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
          type="submit"
          :loading="busy"
          :disabled="busy || !input.trim()"
          icon="i-lucide-arrow-up"
          aria-label="Send"
          class="bros-chat__send"
        />
      </form>
    </div>
  </div>
</template>

<style scoped>
.bros-chat {
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 3rem);
}

.bros-chat--empty {
  align-items: center;
  justify-content: center;
  gap: 1.75rem;
  padding: 2rem 1.25rem 3rem;
}

.bros-chat--thread {
  min-height: calc(100dvh - 3rem);
  height: calc(100dvh - 3rem);
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

.bros-chat__meta {
  margin: 0 0 0.35rem;
  font-size: 0.7rem;
  color: var(--bros-muted);
}

.bros-chat__bubble {
  min-width: 0;
  max-width: 100%;
  font-size: 0.95rem;
  line-height: 1.55;
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
  justify-content: center;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.55rem;
}

.bros-chat__sources {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.bros-chat__model {
  min-width: 10rem;
  max-width: 16rem;
}

.bros-chat__host-note {
  margin: 0 0 0.5rem;
  text-align: center;
  font-size: 0.7rem;
  color: #fde68a;
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
