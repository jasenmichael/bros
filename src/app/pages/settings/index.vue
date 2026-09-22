<script setup lang="ts">
useSeoMeta({ title: 'Settings' })

const { data } = await useFetch<{
  workingDir: string
  dataDir: string
  hasPasscode: boolean
  chatPrepend: string
  chatAssistantDescription: string
  enableHostOllama: boolean
}>('/api/settings')
const passcode = ref('')
const confirm = ref('')
const msg = ref('')
const pending = ref(false)
const prepend = ref(data.value?.chatPrepend ?? '')
const assistantDescription = ref(data.value?.chatAssistantDescription ?? '')
const enableHostOllama = ref(data.value?.enableHostOllama ?? false)
const chatMsg = ref('')
const chatPending = ref(false)

async function saveChat() {
  chatMsg.value = ''
  chatPending.value = true
  try {
    await $fetch('/api/settings', {
      method: 'PATCH',
      body: {
        chatPrepend: prepend.value,
        chatAssistantDescription: assistantDescription.value,
        enableHostOllama: enableHostOllama.value,
      },
    })
    chatMsg.value = 'Chat settings saved.'
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

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <BrosPageShell title="Settings" description="Chat extras, bootstrap paths (read-only), and passkey (writes data/passkey).">
    <div class="max-w-xl space-y-6">
      <form class="space-y-3" @submit.prevent="saveChat">
        <h2 class="text-lg font-medium text-white">Chat</h2>
        <label class="block space-y-1">
          <span class="text-sm text-white">Prepend to every message</span>
          <p class="text-sm text-[var(--bros-muted)]">Extra context added before each send</p>
          <UTextarea v-model="prepend" class="w-full" :rows="3" placeholder="Optional context for every send" />
        </label>
        <label class="block space-y-1">
          <span class="text-sm text-white">Assistant description</span>
          <p class="text-sm text-[var(--bros-muted)]">How the assistant should sound</p>
          <UTextarea v-model="assistantDescription" class="w-full" :rows="3" placeholder="Optional personality or role" />
        </label>
        <p v-if="chatMsg" class="text-sm text-[var(--bros-muted)]">{{ chatMsg }}</p>
        <UButton type="submit" :loading="chatPending">Save</UButton>
      </form>

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

      <div class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-4 text-sm">
        <div class="text-[var(--bros-muted)]">working_dir</div>
        <div class="font-mono text-white">{{ data?.workingDir }}</div>
        <div class="mt-3 text-[var(--bros-muted)]">data_dir</div>
        <div class="font-mono text-white">{{ data?.dataDir }}</div>
        <div class="mt-3 text-[var(--bros-muted)]">passkey file</div>
        <div class="font-mono text-white">{{ data?.dataDir ? `${data.dataDir}/passkey` : '…/passkey' }}</div>
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
