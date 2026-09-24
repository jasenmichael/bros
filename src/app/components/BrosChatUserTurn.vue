<script setup lang="ts">
const props = defineProps<{
  messageId: string
  content: string
}>()

const emit = defineEmits<{
  resend: [text: string]
}>()

const editing = ref(false)
const draft = ref('')
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function copyRaw() {
  try {
    await navigator.clipboard.writeText(props.content)
  } catch {
    const el = document.createElement('textarea')
    el.value = props.content
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1500)
}

function startEdit() {
  editing.value = true
  draft.value = props.content
}

function cancelEdit() {
  editing.value = false
  draft.value = ''
}

function commitResend() {
  const text = draft.value.trim()
  if (!text) return
  emit('resend', text)
  cancelEdit()
}

function onEditKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
    return
  }
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  commitResend()
}

onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <div
    class="bros-chat__user"
    :class="{ 'bros-chat__user--editing': editing }"
  >
    <div
      v-if="editing"
      class="bros-chat__bubble bros-chat__bubble--user bros-chat__bubble--edit"
    >
      <UTextarea
        v-model="draft"
        class="bros-chat__edit"
        :rows="2"
        :maxrows="8"
        autoresize
        variant="none"
        :ui="{ base: 'resize-none bg-transparent ring-0' }"
        @keydown="onEditKeydown"
      />
    </div>
    <div v-else class="bros-chat__bubble bros-chat__bubble--user">
      <BrosChatMarkdown :text="content" />
    </div>
    <div class="bros-chat__user-actions">
      <template v-if="editing">
        <UButton size="xs" color="neutral" variant="ghost" label="Cancel" @click="cancelEdit" />
        <UButton size="xs" label="Resend" :disabled="!draft.trim()" @click="commitResend" />
      </template>
      <template v-else>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          :aria-label="copied ? 'Copied' : 'Copy message'"
          @click="copyRaw"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-pencil"
          aria-label="Edit message"
          @click="startEdit"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.bros-chat__user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: min(36rem, 85%);
}

.bros-chat__user--editing {
  width: min(36rem, 85%);
}

.bros-chat__user-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  margin-top: 0.2rem;
}

.bros-chat__bubble {
  min-width: 0;
  max-width: 100%;
}

.bros-chat__bubble--user {
  max-width: 100%;
  padding: 0.7rem 1rem;
  border-radius: 1.25rem 1.25rem 0.4rem 1.25rem;
  background: color-mix(in srgb, var(--bros-accent) 18%, var(--bros-surface));
  color: var(--bros-text);
}

.bros-chat__edit {
  width: 100%;
}
</style>
