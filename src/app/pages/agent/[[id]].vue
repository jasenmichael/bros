<script setup lang="ts">
import { formatContextLabel, formatDurationMs, formatMetaStats, type ChatMetaStats } from '../../utils/chatMeta'
import { ollamaProviderDisplayName } from '../../utils/ollamaProviderLabel'

type Source = { title: string; url: string }

type Msg = {
  id: string
  role: string
  content: string
  modelId?: string | null
  durationMs?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
  traceJson?: string | null
  sources?: Source[]
}

type AgentRecent = { id: string; title: string; modelId: string; updatedAt: number }

const route = useRoute()
const router = useRouter()

const convoId = computed(() => {
  const raw = route.params.id
  return typeof raw === 'string' && raw ? raw : ''
})

const messages = ref<Msg[]>([])
const input = ref('')
const streaming = ref('')
const streamingModelId = ref('')
const streamingSources = ref<Source[]>([])
const streamingStats = ref<ChatMetaStats>({})
const activity = ref('')
const busy = ref(false)
const thinking = ref(false)
const streamAbort = ref<AbortController | null>(null)
const streamStartedAt = ref(0)
const liveElapsedMs = ref(0)
const providerId = ref('ollama')
const modelName = ref('llama3.2')
const lastPersistedModel = ref<string | null>(null)
const pageTitle = ref('Agent')
const threadEl = ref<HTMLElement | null>(null)
const threadEnd = ref<HTMLElement | null>(null)
let elapsedTimer: ReturnType<typeof setInterval> | null = null

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

const { data: recentsData, refresh: refreshRecents } = useFetch<{ conversations: AgentRecent[] }>('/api/agent', {
  key: 'bros-agent-recents',
  lazy: true,
  server: false,
  default: () => ({ conversations: [] }),
})

const recents = computed(() => recentsData.value?.conversations || [])

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

const pickerMenuUi = { itemWrapper: 'min-w-max', itemLabel: 'whitespace-nowrap' }
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

const isThread = computed(() => Boolean(convoId.value) || messages.value.length > 0 || busy.value)
const thinkingElapsed = computed(() => formatDurationMs(liveElapsedMs.value))
const liveMetaLabel = computed(() => formatMetaStats({
  durationMs: liveElapsedMs.value,
  promptTokens: streamingStats.value.promptTokens,
  completionTokens: streamingStats.value.completionTokens,
}))

function sourcesFrom(traceJson?: string | null): Source[] {
  if (!traceJson) return []
  try {
    const json = JSON.parse(traceJson) as { sources?: Array<{ title?: string; url?: string }> }
    return (json.sources || []).flatMap((row) => {
      if (!row?.url) return []
      return [{ title: row.title || row.url, url: row.url }]
    })
  } catch {
    return []
  }
}

function metaLabel(m: Msg) {
  return formatMetaStats({
    durationMs: m.durationMs,
    promptTokens: m.promptTokens,
    completionTokens: m.completionTokens,
  })
}

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
}

function scrollThread() {
  nextTick(() => threadEnd.value?.scrollIntoView({ block: 'end' }))
}

async function persistOpenModel(next = modelId.value) {
  if (!convoId.value || !next || next === lastPersistedModel.value) return
  await $fetch(`/api/agent/${convoId.value}`, { method: 'PATCH', body: { modelId: next } })
  lastPersistedModel.value = next
}

async function loadConversation(id: string) {
  const convo = await $fetch<{
    messages: Msg[]
    modelId: string
    title: string
  }>(`/api/agent/${id}`)
  messages.value = (convo.messages || []).map((m) => ({ ...m, sources: sourcesFrom(m.traceJson) }))
  pageTitle.value = convo.title || 'Agent'
  lastPersistedModel.value = convo.modelId
  applyModelId(convo.modelId)
  await nextTick()
  scrollThread()
}

watch(providerId, (pid) => {
  const names = modelsForProvider(pid)
  if (names.length && !names.includes(modelName.value)) modelName.value = names[0] || ''
})

watch(modelItems, (names) => {
  if (names.length && !names.includes(modelName.value)) modelName.value = names[0] || ''
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
  modelName.value = modelsForProvider(first.id)[0] || ''
}, { immediate: true })

watch(modelId, (next) => {
  void persistOpenModel(next).catch(() => {})
})

watch(convoId, (id) => {
  if (!id) {
    messages.value = []
    pageTitle.value = 'Agent'
    return
  }
  void loadConversation(id).catch(() => {
    pageTitle.value = 'Agent'
  })
}, { immediate: true })

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

function takeSse(buf: string) {
  const events: Array<{ event: string; data: string }> = []
  let rest = buf
  while (true) {
    const idx = rest.indexOf('\n\n')
    if (idx === -1) break
    const raw = rest.slice(0, idx)
    rest = rest.slice(idx + 2)
    let eventName = 'message'
    const dataLines: string[] = []
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (dataLines.length) events.push({ event: eventName, data: dataLines.join('\n') })
  }
  return { events, rest }
}

let sseBuf = ''

function applySse(chunk: string, flush = false) {
  sseBuf += chunk
  if (flush && sseBuf.trim() && !sseBuf.endsWith('\n\n')) sseBuf += '\n\n'
  const parsed = takeSse(sseBuf)
  sseBuf = parsed.rest
  for (const item of parsed.events) {
    const data = JSON.parse(item.data) as {
      text?: string
      message?: string
      phase?: string
      detail?: string
      sources?: Source[]
      durationMs?: number
      promptTokens?: number | null
      completionTokens?: number | null
    }
    if (item.event === 'token' && data.text) {
      streaming.value += data.text
      activity.value = ''
    } else if (item.event === 'status') {
      if (data.phase === 'searching') activity.value = `Searching ${data.detail || ''}`.trim()
      else if (data.phase === 'reading') activity.value = `Reading ${data.detail || ''}`.trim()
      else activity.value = ''
    } else if (item.event === 'sources' && data.sources) {
      streamingSources.value = data.sources
    } else if (item.event === 'stats') {
      streamingStats.value = {
        durationMs: data.durationMs,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
      }
    } else if (item.event === 'error') {
      throw new Error(data.message || 'Agent failed')
    }
  }
  scrollThread()
}

function finalizeAssistant(usedModel: string, content: string) {
  messages.value.push({
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    modelId: usedModel,
    sources: streamingSources.value,
    durationMs: streamingStats.value.durationMs ?? liveElapsedMs.value,
    promptTokens: streamingStats.value.promptTokens ?? null,
    completionTokens: streamingStats.value.completionTokens ?? null,
  })
}

async function send() {
  if (busy.value || !input.value.trim() || !providerId.value || !modelName.value) return
  const text = input.value.trim()
  input.value = ''
  let id = convoId.value
  if (!id) {
    const convo = await $fetch<{ id: string }>('/api/agent', {
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
  streamingSources.value = []
  streamingStats.value = {}
  streamingModelId.value = usedModel
  activity.value = ''
  sseBuf = ''
  startElapsed()
  try {
    const res = await fetch(`/api/agent/${id}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text, modelId: usedModel }),
      signal: ac.signal,
    })
    if (!res.ok || !res.body) throw new Error(await res.text())
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      applySse(decoder.decode(value, { stream: true }))
    }
    applySse('', true)
    if (streaming.value) finalizeAssistant(usedModel, streaming.value)
    streaming.value = ''
    await refreshRecents()
    if (!convoId.value) await router.replace(`/agent/${id}`)
  } catch (e: unknown) {
    if (isAbortError(e)) {
      if (streaming.value) finalizeAssistant(usedModel, streaming.value)
    } else {
      const errText = e instanceof Error ? e.message : String(e)
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: errText,
        modelId: usedModel,
      })
    }
    streaming.value = ''
    if (!convoId.value && id) await router.replace(`/agent/${id}`)
  } finally {
    thinking.value = false
    activity.value = ''
    streamingModelId.value = ''
    streamAbort.value = null
    stopElapsed()
    busy.value = false
    scrollThread()
  }
}
</script>

<template>
  <div class="bros-chat" :class="isThread ? 'bros-chat--thread' : 'bros-chat--empty'">
    <div v-if="!isThread" class="bros-chat__hero">
      <h1 class="bros-chat__greet">What should we look up?</h1>
      <ul v-if="recents.length" class="bros-agent__recents">
        <li v-for="row in recents" :key="row.id">
          <NuxtLink :to="`/agent/${row.id}`">{{ row.title }}</NuxtLink>
        </li>
      </ul>
    </div>

    <div v-else ref="threadEl" class="bros-chat__thread" aria-live="polite">
      <div
        v-for="m in messages"
        :key="m.id"
        class="bros-chat__turn"
        :class="m.role === 'user' ? 'bros-chat__turn--user' : 'bros-chat__turn--assistant'"
      >
        <div v-if="m.role === 'user'" class="bros-chat__user">
          <div class="bros-chat__bubble bros-chat__bubble--user">
            <BrosChatMarkdown :text="m.content" />
          </div>
        </div>
        <template v-else>
          <div class="bros-chat__bubble bros-chat__bubble--assistant">
            <BrosChatMarkdown :text="m.content" />
          </div>
          <ul v-if="m.sources?.length" class="bros-agent__sources">
            <li v-for="source in m.sources" :key="source.url">
              <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a>
            </li>
          </ul>
          <p class="bros-chat__meta">
            <span class="bros-chat__meta-id">
              ASSISTANT<span v-if="m.modelId"> · {{ m.modelId }}</span>
            </span>
            <span v-if="metaLabel(m)" class="bros-chat__meta-stats">{{ metaLabel(m) }}</span>
          </p>
        </template>
      </div>
      <div v-if="streaming" class="bros-chat__turn bros-chat__turn--assistant">
        <div class="bros-chat__bubble bros-chat__bubble--assistant">
          <BrosChatMarkdown :text="streaming" />
        </div>
        <ul v-if="streamingSources.length" class="bros-agent__sources">
          <li v-for="source in streamingSources" :key="source.url">
            <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a>
          </li>
        </ul>
        <p class="bros-chat__meta">
          <span class="bros-chat__meta-id">
            ASSISTANT<span v-if="streamingModelId"> · {{ streamingModelId }}</span>
          </span>
          <span class="bros-chat__meta-right">
            <UButton type="button" size="xs" color="neutral" variant="ghost" label="Stop" aria-label="Stop" @click="stop" />
            <span v-if="liveMetaLabel" class="bros-chat__meta-stats">{{ liveMetaLabel }}</span>
          </span>
        </p>
      </div>
      <p v-if="thinking && !streaming" class="bros-chat__thinking">
        <span>{{ activity || `thinking… ${thinkingElapsed}` }}</span>
        <UButton type="button" size="xs" color="neutral" variant="ghost" label="Stop" aria-label="Stop" @click="stop" />
      </p>
      <div ref="threadEnd" />
    </div>

    <div class="bros-chat__dock">
      <div class="bros-chat__tools">
        <div class="bros-chat__tools-left">
          <div class="bros-chat__provider-wrap">
            <span class="bros-chat__provider-sizer" aria-hidden="true">{{ longestProviderLabel }}</span>
            <USelect v-model="providerId" :items="providerItems" size="xs" class="bros-chat__provider" :ui="providerPickerUi" />
          </div>
          <USelect v-model="modelName" :items="modelItems" size="xs" class="bros-chat__model" :ui="modelPickerUi" />
        </div>
        <p v-if="contextLabel" class="bros-chat__ctx">{{ contextLabel }}</p>
      </div>
      <form class="bros-chat__composer" @submit.prevent="send">
        <UTextarea
          v-model="input"
          class="bros-chat__input"
          placeholder="Ask with the web…"
          :rows="1"
          :maxrows="8"
          autoresize
          variant="none"
          :ui="{ base: 'resize-none bg-transparent ring-0' }"
          @keydown="onComposerKeydown"
        />
        <UButton
          type="submit"
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
.bros-chat--thread { overflow: hidden; }
.bros-chat__hero { width: min(48rem, 100%); text-align: center; }
.bros-chat__greet {
  margin: 0;
  font-size: clamp(1.5rem, 2.4vw, 2rem);
  font-weight: 550;
  letter-spacing: -0.03em;
  color: #f2f6fb;
}
.bros-agent__recents {
  margin: 1.25rem 0 0;
  padding: 0;
  list-style: none;
  color: var(--bros-muted);
}
.bros-agent__recents a { color: inherit; }
.bros-chat__thread {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 1.25rem 1.25rem 0.5rem;
}
.bros-chat__turn { width: min(48rem, 100%); margin: 0 auto 1.15rem; }
.bros-chat__turn--user { display: flex; justify-content: flex-end; }
.bros-chat__thinking {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: min(48rem, 100%);
  margin: 1.25rem auto;
  font-size: 0.95rem;
  color: var(--bros-muted);
}
.bros-chat__user { max-width: min(36rem, 85%); }
.bros-chat__bubble--user {
  padding: 0.7rem 1rem;
  border-radius: 1.25rem 1.25rem 0.4rem 1.25rem;
  background: color-mix(in srgb, var(--bros-accent) 18%, var(--bros-surface));
  color: var(--bros-text);
}
.bros-chat__bubble--assistant { color: var(--bros-text); }
.bros-agent__sources {
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.75rem;
}
.bros-agent__sources a { color: var(--bros-muted); }
.bros-chat__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.35rem 0 0;
  font-size: 0.7rem;
  color: var(--bros-muted);
}
.bros-chat__meta-right { display: flex; align-items: center; gap: 0.2rem; margin-left: auto; }
.bros-chat__dock {
  width: min(48rem, 100%);
  margin: 0 auto;
  padding: 0.5rem 1.25rem 1.25rem;
  flex-shrink: 0;
}
.bros-chat--empty .bros-chat__dock { width: min(42rem, 100%); }
.bros-chat__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.55rem;
}
.bros-chat__tools-left { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; min-width: 0; }
.bros-chat__provider-wrap { display: inline-grid; width: max-content; max-width: 100%; }
.bros-chat__provider-sizer {
  grid-area: 1 / 1;
  visibility: hidden;
  white-space: nowrap;
  height: 0;
  overflow: hidden;
  font-size: 0.75rem;
  padding: 0 1.75rem 0 0.5rem;
}
:deep(.bros-chat__provider) { grid-area: 1 / 1; width: 100%; min-width: 0; }
.bros-chat__model { min-width: 10rem; max-width: 16rem; }
.bros-chat__ctx { margin: 0 0 0 auto; font-size: 0.7rem; color: var(--bros-muted); }
.bros-chat__composer {
  display: flex;
  align-items: flex-end;
  gap: 0.55rem;
  padding: 0.45rem 0.45rem 0.45rem 1rem;
  border: 1px solid var(--bros-border);
  border-radius: 1.6rem;
  background: color-mix(in srgb, var(--bros-surface) 88%, #0a1016);
}
.bros-chat__input { flex: 1; min-width: 0; }
.bros-chat__send { border-radius: 999px; }
</style>
