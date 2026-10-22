<script setup lang="ts">
const props = defineProps<{
  loading: boolean
  chats?: Array<{
    id: string
    title: string
    modelId: string
    updatedAt: number
  }> | null
}>()

function ago(updatedAt: number) {
  const seconds = Math.max(0, Date.now() - updatedAt) / 1000
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

const rows = computed(() => props.chats ?? [])
</script>

<template>
  <article class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-lg font-medium text-white">Chats</h2>
      <NuxtLink
        to="/chat"
        class="text-sm text-[var(--bros-accent)] underline-offset-2 hover:underline"
      >New chat</NuxtLink>
    </div>
    <p v-if="loading" class="mt-3 text-sm text-[var(--bros-muted)]">Loading…</p>
    <p v-else-if="!rows.length" class="mt-3 text-sm text-[var(--bros-muted)]">
      No chats yet.
    </p>
    <ul v-else class="mt-3 divide-y divide-[var(--bros-border)]">
      <li v-for="chat in rows" :key="chat.id">
        <NuxtLink
          :to="`/chat/${chat.id}`"
          class="flex items-baseline justify-between gap-3 py-2.5"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm text-white">{{ chat.title }}</span>
            <span class="block truncate text-xs text-[var(--bros-muted)]">{{ chat.modelId }}</span>
          </span>
          <span class="shrink-0 text-xs text-[var(--bros-muted)]">{{ ago(chat.updatedAt) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </article>
</template>
