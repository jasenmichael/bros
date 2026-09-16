<script setup lang="ts">
definePageMeta({ layout: false })
useSeoMeta({ title: 'Setup' })

const passcode = ref('')
const confirm = ref('')
const error = ref('')
const pending = ref(false)

async function submit() {
  error.value = ''
  if (passcode.value.length < 4) {
    error.value = 'Passcode must be at least 4 characters'
    return
  }
  if (passcode.value !== confirm.value) {
    error.value = 'Passcodes do not match'
    return
  }
  pending.value = true
  try {
    await $fetch('/api/auth/setup', { method: 'POST', body: { passcode: passcode.value } })
    await navigateTo('/')
  } catch (e: unknown) {
    error.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Setup failed'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
    <h1 class="text-2xl font-semibold text-white">Set passcode</h1>
    <p class="mt-2 text-sm text-[var(--bros-muted)]">First-run shared passcode for this Bros instance.</p>
    <form class="mt-6 space-y-3" @submit.prevent="submit">
      <UInput v-model="passcode" type="password" placeholder="Passcode" size="lg" />
      <UInput v-model="confirm" type="password" placeholder="Confirm" size="lg" />
      <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
      <UButton type="submit" block :loading="pending">Continue</UButton>
    </form>
  </div>
</template>
