<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelId?: string | null
  copyText?: string
  statsLabel?: string
  showStop?: boolean
}>(), {
  modelId: null,
  copyText: '',
  statsLabel: '',
  showStop: false,
})

const emit = defineEmits<{
  stop: []
}>()

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function copyRaw() {
  if (!props.copyText) return
  try {
    await navigator.clipboard.writeText(props.copyText)
  } catch {
    const el = document.createElement('textarea')
    el.value = props.copyText
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

onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <p class="bros-chat__meta">
    <span class="bros-chat__meta-id">
      ASSISTANT<span v-if="modelId"> · {{ modelId }}</span>
    </span>
    <span class="bros-chat__meta-right">
      <UButton
        v-if="showStop"
        type="button"
        size="xs"
        color="neutral"
        variant="ghost"
        label="Stop"
        aria-label="Stop"
        class="bros-chat__stop"
        @click="emit('stop')"
      />
      <UButton
        v-else-if="copyText"
        size="xs"
        color="neutral"
        variant="ghost"
        class="bros-chat__copy"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        :aria-label="copied ? 'Copied' : 'Copy reply'"
        @click="copyRaw"
      />
      <span v-if="statsLabel" class="bros-chat__meta-stats">{{ statsLabel }}</span>
    </span>
  </p>
</template>

<style scoped>
.bros-chat__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.35rem 0 0;
  font-size: 0.7rem;
  color: var(--bros-muted);
}

.bros-chat__meta-id {
  min-width: 0;
}

.bros-chat__meta-right {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  margin-left: auto;
  flex-shrink: 0;
}

.bros-chat__meta-stats {
  flex-shrink: 0;
}

.bros-chat__copy {
  min-width: 0;
}
</style>
