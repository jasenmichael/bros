<script setup lang="ts">
const props = defineProps<{
  code?: string
  language?: string | null
  filename?: string | null
  highlights?: unknown[]
  meta?: string | null
  class?: string | null
}>()

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

const label = computed(() => props.filename || props.language || 'code')

async function copySnippet() {
  const text = props.code || ''
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1500)
}

onBeforeUnmount(() => {
  clearTimeout(copiedTimer)
})
</script>

<template>
  <div class="bros-code">
    <div class="bros-code__bar">
      <span class="bros-code__label">{{ label }}</span>
      <button
        type="button"
        class="bros-code__copy"
        :aria-label="copied ? 'Copied' : 'Copy code'"
        :title="copied ? 'Copied' : 'Copy'"
        @click="copySnippet"
      >
        <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3.5" />
      </button>
    </div>
    <pre :class="props.class"><slot /></pre>
  </div>
</template>

<style scoped>
.bros-code {
  overflow: hidden;
  margin: 0.75rem 0;
  border: 1px solid var(--bros-border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--bros-surface) 70%, #0a1016);
}

.bros-code__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.65rem;
  border-bottom: 1px solid var(--bros-border);
  background: color-mix(in srgb, var(--bros-surface) 55%, #0a1016);
}

.bros-code__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  color: var(--bros-muted);
}

.bros-code__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  height: 1.65rem;
  flex-shrink: 0;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--bros-muted);
  cursor: pointer;
}

.bros-code__copy:hover,
.bros-code__copy:focus-visible {
  color: var(--bros-accent-2);
  background: color-mix(in srgb, var(--bros-accent-2) 12%, transparent);
}

.bros-code pre {
  margin: 0;
  overflow-x: auto;
  padding: 0.85rem 1rem 1rem;
  font-size: 0.8rem;
  line-height: 1.5;
}

:global(pre code .line) {
  display: block;
}
</style>
