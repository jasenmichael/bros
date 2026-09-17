<script setup lang="ts">
useSeoMeta({ title: 'Chat' })

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

const { data: modelsData, refresh: refreshModels } = await useFetch<{
  ollamaModels: Array<{ id: string }>
  providers: Array<{ id: string; kind: string; config?: Record<string, unknown> }>
  ollamaSource?: 'host' | 'sidecar' | 'external'
  hostOllama?: { port: number; version: string } | null
  sidecarPublish?: number
}>('/api/models')

const ollama = computed(() => modelsData.value?.providers.find((p) => p.id === 'ollama'))
const chatSource = computed(() => {
  if (pendingSource.value) return pendingSource.value
  const mode = ollama.value?.config?.mode as string | undefined
  if (mode === 'host' || mode === 'sidecar' || mode === 'external') return mode
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
}

watch(convoId, (id) => {
  if (id) void loadConversation(id)
  else resetEmpty()
}, { immediate: true })

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
  <BrosPageShell :title="pageTitle" description="Bros Chat — streaming against configured models.">
    <div class="flex min-h-[60vh] flex-col rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/50">
      <div class="border-b border-[var(--bros-border)] p-3 space-y-2">
        <div v-if="modelsData?.hostOllama" class="flex flex-wrap gap-2">
          <UButton
            size="xs"
            :variant="chatSource === 'host' ? 'solid' : 'outline'"
            :color="chatSource === 'host' ? 'primary' : 'neutral'"
            @click="setChatSource('host')"
          >
            Host :{{ modelsData.hostOllama.port }}
          </UButton>
          <UButton
            size="xs"
            :variant="chatSource === 'sidecar' ? 'solid' : 'outline'"
            :color="chatSource === 'sidecar' ? 'primary' : 'neutral'"
            @click="setChatSource('sidecar')"
          >
            Sidecar :{{ modelsData.sidecarPublish || 11435 }}
          </UButton>
        </div>
        <p v-if="chatSource === 'host'" class="text-xs text-amber-200">
          Chat and pull write to the host Ollama disk, not $BROS_DIR/data/ollama.
        </p>
        <USelect v-model="modelId" :items="modelOptions" />
      </div>
      <div class="flex-1 space-y-3 overflow-y-auto p-4">
        <div v-for="m in messages" :key="m.id" class="rounded-lg px-3 py-2 text-sm" :class="m.role === 'user' ? 'bg-white/10 text-white' : 'bg-black/20 text-slate-200'">
          <div class="mb-1 text-xs tracking-wide text-[var(--bros-muted)]">
            <span class="uppercase">{{ m.role }}</span>
            <span v-if="m.role === 'assistant' && m.modelId"> · {{ m.modelId }}</span>
          </div>
          <div class="whitespace-pre-wrap">{{ m.content }}</div>
        </div>
        <div v-if="streaming" class="rounded-lg bg-black/20 px-3 py-2 text-sm text-slate-200">
          <div class="mb-1 text-xs tracking-wide text-[var(--bros-muted)]">
            <span class="uppercase">assistant</span>
            <span v-if="streamingModelId"> · {{ streamingModelId }}</span>
          </div>
          <div class="whitespace-pre-wrap">{{ streaming }}</div>
        </div>
      </div>
      <form class="flex gap-2 border-t border-[var(--bros-border)] p-3" @submit.prevent="send">
        <UInput v-model="input" class="flex-1" placeholder="Message…" :disabled="busy" />
        <UButton type="submit" :loading="busy">Send</UButton>
      </form>
    </div>
  </BrosPageShell>
</template>
