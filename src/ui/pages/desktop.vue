<script setup lang="ts">
useSeoMeta({ title: 'Desktop' })

const panel = ref<'' | 'library'>('')
// Empty until the iframe is in the document and this page is visible.
// A hidden frame makes Selkies send STOP_VIDEO and sit on "Waiting for stream...".
const streamSrc = ref('')

function armStream() {
  if (streamSrc.value || document.visibilityState !== 'visible') return
  streamSrc.value = '/desktop/view/'
  document.removeEventListener('visibilitychange', armStream)
}

onMounted(() => {
  armStream()
  if (!streamSrc.value) document.addEventListener('visibilitychange', armStream)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', armStream))
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <iframe
      :src="streamSrc || undefined"
      title="Desktop"
      allow="clipboard-read; clipboard-write"
      class="min-h-0 w-full flex-1 cursor-default border-0 bg-[#141a22]"
    />
    <DesktopDrawer @library="panel = 'library'" />
    <div v-if="panel" class="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4" @click.self="panel = ''">
      <div class="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--bros-border)] bg-[#141a22] shadow-2xl">
        <button type="button" class="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-[var(--bros-muted)] hover:bg-white/10" aria-label="Close" @click="panel = ''">
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
        <div class="min-h-0 overflow-auto">
          <DesktopAppLibrary @opened="panel = ''" />
        </div>
        <NuxtLink
          to="/apps"
          class="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--bros-border)] bg-[#141a22]/95 text-[var(--bros-muted)] hover:bg-white/10 hover:text-white"
          aria-label="Apps"
        >
          <UIcon name="i-lucide-settings" class="size-4" />
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
