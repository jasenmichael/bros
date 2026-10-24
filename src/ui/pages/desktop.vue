<script setup lang="ts">
useSeoMeta({ title: 'Desktop' })

const panel = ref<'' | 'library' | 'board'>('')
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
      class="min-h-0 w-full flex-1 border-0 bg-[#141a22]"
    />
    <DesktopDrawer @library="panel = 'library'" />
    <div v-if="panel" class="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div class="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--bros-border)] bg-[#141a22] shadow-2xl">
        <header class="flex items-center justify-between border-b border-[var(--bros-border)] px-4 py-3">
          <div class="flex items-center gap-2">
            <button
              v-if="panel === 'board'"
              type="button"
              class="rounded-lg p-1.5 text-[var(--bros-muted)] hover:bg-white/10"
              aria-label="Back"
              @click="panel = 'library'"
            >
              <UIcon name="i-lucide-arrow-left" class="size-4" />
            </button>
            <p class="text-sm font-medium text-white">Apps</p>
          </div>
          <button type="button" class="rounded-lg p-1.5 text-[var(--bros-muted)] hover:bg-white/10" aria-label="Close" @click="panel = ''">
            <UIcon name="i-lucide-x" class="size-4" />
          </button>
        </header>
        <div class="min-h-0 overflow-auto">
          <DesktopAppsBoard v-if="panel === 'board'" />
          <DesktopAppLibrary v-else />
        </div>
        <button
          v-if="panel === 'library'"
          type="button"
          class="absolute bottom-4 right-4 flex size-11 items-center justify-center rounded-full border border-[var(--bros-border)] bg-[#0f1419] text-[var(--bros-muted)] shadow-lg hover:text-white"
          aria-label="Desktop settings"
          @click="panel = 'board'"
        >
          <UIcon name="i-lucide-settings" class="size-5" />
        </button>
      </div>
    </div>
  </div>
</template>
