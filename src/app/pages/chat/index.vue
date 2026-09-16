<script setup lang="ts">
useSeoMeta({ title: 'Chat' })

type Convo = { id: string; title: string; modelId: string; updatedAt: number }
type Msg = { id: string; role: string; content: string }

const { data: listData, refresh: refreshList } = await useFetch<{ conversations: Convo[] }>('/api/chat')
const { data: modelsData } = await useFetch<{ ollamaModels: Array<{ id: string }>; providers: Array<{ id: string; kind: string }> }>('/api/models')

const activeId = ref<string | null>(null)
const messages = ref<Msg[]>([])
const input = ref('')
const streaming = ref('')
const busy = ref(false)
const modelId = ref('ollama/llama3.2')

const modelOptions = computed(() => {
  const opts = (modelsData.value?.ollamaModels || []).map((m) => m.id)
  for (const p of modelsData.value?.providers || []) {
    if (p.kind === 'openai') opts.push(`${p.id}/gpt-4o`)
    if (p.kind === 'anthropic') opts.push(`${p.id}/claude-3-5-sonnet-latest`)
  }
  return opts.length ? opts : ['ollama/llama3.2']
})

watch(modelOptions, (opts) => {
  if (!opts.includes(modelId.value)) modelId.value = opts[0]
}, { immediate: true })

async function selectConvo(id: string) {
  activeId.value = id
  const convo = await $fetch<{ messages: Msg[]; modelId: string }>(`/api/chat/${id}`)
  messages.value = convo.messages
  modelId.value = convo.modelId
  streaming.value = ''
}

async function newChat() {
  const convo = await $fetch<{ id: string }>('/api/chat', {
    method: 'POST',
    body: { modelId: modelId.value },
  })
  await refreshList()
  await selectConvo(convo.id)
}

async function removeChat(id: string) {
  await $fetch(`/api/chat/${id}`, { method: 'DELETE' })
  if (activeId.value === id) {
    activeId.value = null
    messages.value = []
  }
  await refreshList()
}

async function send() {
  if (!input.value.trim()) return
  if (!activeId.value) await newChat()
  const text = input.value.trim()
  input.value = ''
  messages.value.push({ id: crypto.randomUUID(), role: 'user', content: text })
  busy.value = true
  streaming.value = ''
  try {
    const res = await fetch(`/api/chat/${activeId.value}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text }),
    })
    if (!res.ok || !res.body) throw new Error(await res.text())
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      streaming.value += decoder.decode(value, { stream: true })
    }
    messages.value.push({ id: crypto.randomUUID(), role: 'assistant', content: streaming.value })
    streaming.value = ''
    await refreshList()
  } catch (e: unknown) {
    messages.value.push({ id: crypto.randomUUID(), role: 'assistant', content: `Error: ${e instanceof Error ? e.message : String(e)}` })
    streaming.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BrosPageShell title="Chat" description="Bros Chat — streaming against configured models.">
    <div class="grid gap-4 lg:grid-cols-[240px_1fr]">
      <aside class="space-y-2">
        <UButton block @click="newChat">New chat</UButton>
        <button
          v-for="c in listData?.conversations || []"
          :key="c.id"
          type="button"
          class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5"
          :class="activeId === c.id ? 'bg-white/10 text-white' : 'text-[var(--bros-muted)]'"
          @click="selectConvo(c.id)"
        >
          <span class="truncate">{{ c.title }}</span>
          <span class="text-xs" @click.stop="removeChat(c.id)">✕</span>
        </button>
      </aside>
      <div class="flex min-h-[60vh] flex-col rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/50">
        <div class="border-b border-[var(--bros-border)] p-3">
          <USelect v-model="modelId" :items="modelOptions" />
        </div>
        <div class="flex-1 space-y-3 overflow-y-auto p-4">
          <div v-for="m in messages" :key="m.id" class="rounded-lg px-3 py-2 text-sm" :class="m.role === 'user' ? 'bg-white/10 text-white' : 'bg-black/20 text-slate-200'">
            <div class="mb-1 text-xs uppercase tracking-wide text-[var(--bros-muted)]">{{ m.role }}</div>
            <div class="whitespace-pre-wrap">{{ m.content }}</div>
          </div>
          <div v-if="streaming" class="rounded-lg bg-black/20 px-3 py-2 text-sm text-slate-200">
            <div class="mb-1 text-xs uppercase tracking-wide text-[var(--bros-muted)]">assistant</div>
            <div class="whitespace-pre-wrap">{{ streaming }}</div>
          </div>
        </div>
        <form class="flex gap-2 border-t border-[var(--bros-border)] p-3" @submit.prevent="send">
          <UInput v-model="input" class="flex-1" placeholder="Message…" :disabled="busy" />
          <UButton type="submit" :loading="busy">Send</UButton>
        </form>
      </div>
    </div>
  </BrosPageShell>
</template>
