<script setup lang="ts">
useSeoMeta({ title: 'Settings' })

const { data, refresh } = await useFetch<{
  appDir: string
  dataDir: string
  publicUrl: string | null
  hasPasscode: boolean
  enableHostOllama: boolean
  enableWhisper: boolean
  proxyKey?: string
  proxyUrls?: string[]
}>('/api/settings')
const passcode = ref('')
const confirm = ref('')
const msg = ref('')
const pending = ref(false)
const proxyMsg = ref('')
const proxyPending = ref(false)
const { data: rulesSkill } = await useFetch<{ body: string }>('/api/skills/rules')
const { data: personalitySkill } = await useFetch<{ body: string }>('/api/skills/personality')
const prepend = ref(rulesSkill.value?.body || '')
const assistantDescription = ref(personalitySkill.value?.body || '')
const enableHostOllama = ref(data.value?.enableHostOllama ?? false)
const enableWhisper = ref(data.value?.enableWhisper ?? false)
const whisperPending = ref(false)
const whisperMsg = ref('')
const chatMsg = ref('')
const chatPending = ref(false)
const mcpServers = ref<Array<{ id: string; url: string; enabled: boolean }>>([])
const mcpId = ref('')
const mcpUrl = ref('')

async function loadMcp() {
  const mcp = await $fetch<{ servers: Array<{ id: string; url: string; enabled: boolean }> }>('/api/mcp')
  mcpServers.value = mcp.servers
}

async function addMcp() {
  if (!mcpId.value.trim() || !mcpUrl.value.trim()) return
  const saved = await $fetch<{ servers: Array<{ id: string; url: string; enabled: boolean }> }>('/api/mcp', {
    method: 'POST',
    body: { id: mcpId.value.trim(), url: mcpUrl.value.trim() },
  })
  mcpServers.value = saved.servers
  mcpId.value = ''
  mcpUrl.value = ''
}

async function toggleMcp(id: string, enabled: boolean) {
  const saved = await $fetch<{ servers: Array<{ id: string; url: string; enabled: boolean }> }>(`/api/mcp/${id}`, {
    method: 'PATCH',
    body: { enabled },
  })
  mcpServers.value = saved.servers
}

onMounted(() => { loadMcp().catch(() => {}) })

async function saveChat() {
  chatMsg.value = ''
  chatPending.value = true
  try {
    await $fetch('/api/skills/rules', { method: 'PUT', body: { body: prepend.value } })
    await $fetch('/api/skills/personality', { method: 'PUT', body: { body: assistantDescription.value } })
    chatMsg.value = 'Saved.'
  } catch (e: unknown) {
    chatMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Save failed'
  } finally {
    chatPending.value = false
  }
}

async function saveHostOllama(value: boolean) {
  enableHostOllama.value = value
  chatMsg.value = ''
  try {
    await $fetch('/api/settings', {
      method: 'PATCH',
      body: { enableHostOllama: value },
    })
  } catch (e: unknown) {
    enableHostOllama.value = !value
    chatMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Save failed'
  }
}

async function saveWhisper(value: boolean) {
  enableWhisper.value = value
  whisperMsg.value = ''
  whisperPending.value = true
  try {
    const saved = await $fetch<{ enableWhisper: boolean }>('/api/settings', {
      method: 'PATCH',
      body: { enableWhisper: value },
    })
    enableWhisper.value = saved.enableWhisper
  } catch (e: unknown) {
    enableWhisper.value = !value
    whisperMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Save failed'
  } finally {
    whisperPending.value = false
  }
}

async function changePasscode() {
  msg.value = ''
  if (passcode.value.length < 4 || passcode.value !== confirm.value) {
    msg.value = 'Passcodes must match and be at least 4 characters'
    return
  }
  pending.value = true
  try {
    await $fetch('/api/settings/passcode', { method: 'POST', body: { passcode: passcode.value } })
    msg.value = 'Passcode updated.'
    passcode.value = ''
    confirm.value = ''
  } catch (e: unknown) {
    msg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Update failed'
  } finally {
    pending.value = false
  }
}

async function rotateProxyKey() {
  proxyPending.value = true
  proxyMsg.value = ''
  try {
    await $fetch('/api/settings/proxy-key', { method: 'POST' })
    await refresh()
    proxyMsg.value = 'Proxy key rotated. Update clients that send the old key.'
  } catch (e: unknown) {
    proxyMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Rotate failed'
  } finally {
    proxyPending.value = false
  }
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <BrosPageShell title="Settings" description="Personality and rules skills, Whisper, bootstrap paths (read-only), proxy key, and passkey.">
    <div class="max-w-xl space-y-6">
      <form class="space-y-3" @submit.prevent="saveChat">
        <h2 class="text-lg font-medium text-white">Chat</h2>
        <label class="block space-y-1">
          <span class="text-sm text-white">Prepend to every message</span>
          <p class="text-sm text-[var(--bros-muted)]">Rules skill. Loaded on every Chat turn.</p>
          <UTextarea v-model="prepend" class="w-full" :rows="3" placeholder="Optional context for every send" />
        </label>
        <label class="block space-y-1">
          <span class="text-sm text-white">Assistant description</span>
          <p class="text-sm text-[var(--bros-muted)]">Personality skill. How the assistant should sound.</p>
          <UTextarea v-model="assistantDescription" class="w-full" :rows="3" placeholder="Optional personality or role" />
        </label>
        <p v-if="chatMsg" class="text-sm text-[var(--bros-muted)]">{{ chatMsg }}</p>
        <UButton type="submit" :loading="chatPending">Save</UButton>
      </form>

      <div class="space-y-2">
        <h2 class="text-lg font-medium text-white">Whisper</h2>
        <label class="flex items-start justify-between gap-4">
          <span class="space-y-1">
            <span class="block text-sm text-white">Enable Whisper</span>
            <p class="text-sm text-[var(--bros-muted)]">
              Speech-to-text for Chat. Off by default. Turning this on pulls the Whisper images, then starts the sidecar.
            </p>
          </span>
          <USwitch
            :model-value="enableWhisper"
            :loading="whisperPending"
            :disabled="whisperPending"
            aria-label="Enable Whisper"
            @update:model-value="saveWhisper"
          />
        </label>
        <p v-if="whisperMsg" class="text-sm text-[var(--bros-muted)]">{{ whisperMsg }}</p>
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-medium text-white">Host Ollama</h2>
        <label class="flex items-start justify-between gap-4">
          <span class="space-y-1">
            <span class="block text-sm text-white">Enable host Ollama</span>
            <p class="text-sm text-[var(--bros-muted)]">
              Show the host daemon as a Chat/Providers row. Bros never starts it.
            </p>
          </span>
          <USwitch
            :model-value="enableHostOllama"
            aria-label="Enable host Ollama"
            @update:model-value="saveHostOllama"
          />
        </label>
      </div>

      <form class="space-y-3" @submit.prevent="addMcp">
        <h2 class="text-lg font-medium text-white">MCP</h2>
        <p class="text-sm text-[var(--bros-muted)]">Stored for a later tool engine. Chat does not call these servers.</p>
        <div v-for="server in mcpServers" :key="server.id" class="flex items-center justify-between gap-3 text-sm text-white">
          <span class="font-mono">{{ server.id }}</span>
          <USwitch :model-value="server.enabled" :aria-label="`Enable ${server.id}`" @update:model-value="(v: boolean) => toggleMcp(server.id, v)" />
        </div>
        <UInput v-model="mcpId" class="w-full" placeholder="Server id" />
        <UInput v-model="mcpUrl" class="w-full" placeholder="http://host:port/mcp" />
        <UButton type="submit">Add MCP server</UButton>
      </form>

      <div class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-4 text-sm">
        <div class="text-[var(--bros-muted)]">BROS_DIR</div>
        <div class="font-mono text-white">{{ data?.appDir }}</div>
        <div class="mt-3 text-[var(--bros-muted)]">BROS_DATA_DIR</div>
        <div class="font-mono text-white">{{ data?.dataDir }}</div>
        <div class="mt-3 text-[var(--bros-muted)]">passkey file</div>
        <div class="font-mono text-white">{{ data?.dataDir ? `${data.dataDir}/passkey` : '…/passkey' }}</div>
      </div>

      <div class="space-y-3">
        <h2 class="text-lg font-medium text-white">Proxy key</h2>
        <p class="text-sm text-[var(--bros-muted)]">
          External clients send <span class="font-mono">Authorization: Bearer</span> this key on tunneled sidecar APIs.
          It does not log into Bros. Cursor uses the URL as Override OpenAI Base URL and this key as the OpenAI API key.
        </p>
        <div class="font-mono text-sm text-white break-all">{{ data?.proxyKey || '…' }}</div>
        <ul v-if="data?.proxyUrls?.length" class="space-y-1 font-mono text-sm text-white">
          <li v-for="url in data.proxyUrls" :key="url">{{ url }}</li>
        </ul>
        <p v-else class="text-sm text-[var(--bros-muted)]">No api or openai sidecar is proxied yet.</p>
        <p v-if="proxyMsg" class="text-sm text-[var(--bros-muted)]">{{ proxyMsg }}</p>
        <UButton type="button" :loading="proxyPending" @click="rotateProxyKey">Rotate proxy key</UButton>
      </div>

      <form class="space-y-3" @submit.prevent="changePasscode">
        <h2 class="text-lg font-medium text-white">Passkey</h2>
        <p class="text-sm text-[var(--bros-muted)]">Updates <span class="font-mono">data/passkey</span> (source of truth for login).</p>
        <UInput v-model="passcode" class="w-full" type="password" placeholder="New passkey" />
        <UInput v-model="confirm" class="w-full" type="password" placeholder="Confirm" />
        <p v-if="msg" class="text-sm text-[var(--bros-muted)]">{{ msg }}</p>
        <UButton type="submit" :loading="pending">Update passkey</UButton>
      </form>

      <UButton color="neutral" variant="outline" @click="logout">Log out</UButton>
    </div>
  </BrosPageShell>
</template>
