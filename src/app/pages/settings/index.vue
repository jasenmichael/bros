<script setup lang="ts">
useSeoMeta({ title: 'Settings' })

const { data } = await useFetch<{ workingDir: string; dataDir: string; hasPasscode: boolean }>('/api/settings')
const passcode = ref('')
const confirm = ref('')
const msg = ref('')
const pending = ref(false)

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
  <BrosPageShell title="Settings" description="Bootstrap paths (read-only) and passkey (writes data/passkey).">
    <div class="max-w-xl space-y-6">
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
        <UInput v-model="passcode" type="password" placeholder="New passkey" />
        <UInput v-model="confirm" type="password" placeholder="Confirm" />
        <p v-if="msg" class="text-sm text-[var(--bros-muted)]">{{ msg }}</p>
        <UButton type="submit" :loading="pending">Update passkey</UButton>
      </form>

      <UButton color="neutral" variant="outline" @click="logout">Log out</UButton>
    </div>
  </BrosPageShell>
</template>
