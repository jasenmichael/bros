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

function errorMessage(e: unknown): string {
  if (!e || typeof e !== 'object') return 'Login failed'
  const err = e as {
    data?: { statusMessage?: string; message?: string }
    statusMessage?: string
    message?: string
  }
  return err.data?.statusMessage || err.data?.message || err.statusMessage || err.message || 'Login failed'
}

async function submit() {
  error.value = ''
  const code = passcode.value.trim()
  if (!code) {
    error.value = 'Passkey required'
    return
  }
  pending.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { passcode: code } })
    // Full navigation so HttpOnly session cookie is always applied (esp. via tunnel).
    await navigateTo('/', { external: true })
  } catch (e: unknown) {
    error.value = errorMessage(e)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
    <h1 class="text-2xl font-semibold text-white">Unlock Bros</h1>
    <p class="mt-2 text-sm text-[var(--bros-muted)]">
      Enter the shared passkey (printed in app logs at startup; also in <span class="font-mono">data/passkey</span>).
    </p>
    <form class="mt-6 space-y-3" @submit.prevent="submit">
      <label class="block text-sm text-[var(--bros-muted)]">
        Passkey
        <UInput
          v-model="passcode"
          type="password"
          placeholder="Passkey"
          size="lg"
          class="mt-1 w-full"
          autocomplete="current-password"
          autofocus
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? 'login-error' : undefined"
        />
      </label>
      <p v-if="error" id="login-error" role="alert" class="text-sm text-red-400">{{ error }}</p>
      <UButton type="submit" block :loading="pending">Unlock</UButton>
    </form>
  </div>
</template>
