<script setup lang="ts">
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
if (!props.embedded) useSeoMeta({ title: 'Desktop' })

const color = ref('#141a22')
const imageUrl = ref('')
const msg = ref('')
const pending = ref(false)

const { data, refresh } = await useFetch<{ color: string, imageUrl: string }>('/api/settings/desktop')

watch(data, (v) => {
  if (!v) return
  color.value = v.color || '#141a22'
  imageUrl.value = v.imageUrl || ''
}, { immediate: true })

async function save() {
  msg.value = ''
  pending.value = true
  try {
    await $fetch('/api/settings/desktop', {
      method: 'PATCH',
      body: { color: color.value, imageUrl: imageUrl.value.trim() },
    })
    await refresh()
    msg.value = 'Saved.'
  } catch (e: unknown) {
    msg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Save failed'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <BrosPageShell
    :title="embedded ? undefined : 'Desktop'"
    :description="embedded ? undefined : 'Background for the Selkies desktop.'"
    :class="embedded ? 'bros-settings-embed' : undefined"
  >
    <form class="max-w-xl space-y-4" @submit.prevent="save">
      <h2 v-if="embedded" class="text-lg font-medium text-white">Background</h2>
      <label class="block space-y-1">
        <span class="text-sm text-white">Color</span>
        <div class="flex items-center gap-3">
          <input v-model="color" type="color" class="h-10 w-14 cursor-pointer rounded border border-[var(--bros-border)] bg-transparent" aria-label="Background color">
          <UInput v-model="color" class="flex-1 font-mono" placeholder="#141a22" />
        </div>
      </label>
      <label class="block space-y-1">
        <span class="text-sm text-white">Image URL</span>
        <p class="text-sm text-[var(--bros-muted)]">Optional. Empty uses the solid color only.</p>
        <UInput v-model="imageUrl" class="w-full" type="url" placeholder="https://…" />
      </label>
      <p v-if="msg" class="text-sm text-[var(--bros-muted)]">{{ msg }}</p>
      <UButton type="submit" :loading="pending">Save</UButton>
    </form>
  </BrosPageShell>
</template>
