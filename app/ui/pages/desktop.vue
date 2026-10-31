<script setup lang="ts">
useSeoMeta({ title: 'Desktop' })

const panel = ref<'' | 'library' | 'settings'>('')
const settingsTab = ref<'desktop' | 'apps'>('desktop')
const libraryRef = ref<{ focusRoot?: () => void } | null>(null)
// Empty until the iframe is in the document and this page is visible.
const streamSrc = ref('')

function armStream() {
  if (streamSrc.value || document.visibilityState !== 'visible') return
  streamSrc.value = '/desktop/view/'
  document.removeEventListener('visibilitychange', armStream)
}

function openLibrary() {
  panel.value = 'library'
  nextTick(() => libraryRef.value?.focusRoot?.())
}

function openSettings(tab: 'desktop' | 'apps' = 'desktop') {
  settingsTab.value = tab
  panel.value = 'settings'
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
    <DesktopDrawer @library="openLibrary" />
    <div
      v-if="panel === 'library'"
      class="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      @click.self="panel = ''"
    >
      <div
        class="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--bros-border)] bg-[#141a22] shadow-2xl"
        tabindex="-1"
        @pointerdown.self="($event.target as HTMLElement).focus()"
      >
        <button type="button" class="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-[var(--bros-muted)] hover:bg-white/10" aria-label="Close" @click="panel = ''">
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
        <div class="min-h-0 overflow-auto">
          <DesktopAppLibrary ref="libraryRef" @opened="panel = ''" />
        </div>
        <button
          type="button"
          class="absolute bottom-0.5 right-0.5 z-10 p-1.5 text-[var(--bros-muted)] hover:text-white"
          aria-label="Desktop settings"
          @pointerdown.prevent="openSettings('desktop')"
        >
          <UIcon name="i-lucide-settings" class="size-3.5" />
        </button>
      </div>
    </div>
    <div
      v-if="panel === 'settings'"
      class="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      @click.self="panel = ''"
    >
      <div class="relative flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--bros-border)] bg-[#141a22] shadow-2xl">
        <div class="flex items-center gap-2 border-b border-[var(--bros-border)] px-4 py-3">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm"
            :class="settingsTab === 'desktop' ? 'bg-white/10 text-white' : 'text-[var(--bros-muted)] hover:text-white'"
            @click="settingsTab = 'desktop'"
          >
            Desktop
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm"
            :class="settingsTab === 'apps' ? 'bg-white/10 text-white' : 'text-[var(--bros-muted)] hover:text-white'"
            @click="settingsTab = 'apps'"
          >
            Apps
          </button>
          <button type="button" class="ml-auto rounded-lg p-1.5 text-[var(--bros-muted)] hover:bg-white/10" aria-label="Close" @click="panel = ''">
            <UIcon name="i-lucide-x" class="size-4" />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-auto">
          <SettingsDesktopBackground v-if="settingsTab === 'desktop'" embedded />
          <SettingsDesktopApps v-else embedded />
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.bros-settings-embed.mx-auto {
  max-width: none;
  padding-top: 1rem;
  padding-bottom: 1rem;
}
</style>
