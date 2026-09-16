<script setup lang="ts">
definePageMeta({ layout: false })
useSeoMeta({ title: 'Login' })

const passcode = ref('')
const error = ref('')
const pending = ref(false)

onMounted(async () => {
  const status = await $fetch<{ hasPasscode: boolean }>('/api/auth/status')
  if (!status.hasPasscode) await navigateTo('/setup')
})

async function submit() {
  error.value = ''
  pending.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { passcode: passcode.value } })
    await navigateTo('/')
  } catch (e: unknown) {
    error.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Login failed'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
    <h1 class="text-2xl font-semibold text-white">Unlock Bros</h1>
    <p class="mt-2 text-sm text-[var(--bros-muted)]">Enter the shared passcode.</p>
    <form class="mt-6 space-y-3" @submit.prevent="submit">
      <UInput v-model="passcode" type="password" placeholder="Passcode" size="lg" />
      <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
      <UButton type="submit" block :loading="pending">Unlock</UButton>
    </form>
  </div>
</template>
