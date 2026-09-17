<script setup lang="ts">
const props = defineProps<{
  text: string
}>()

const source = computed(() => props.text || '')
const root = ref<HTMLElement | null>(null)

function decorateFences() {
  const el = root.value
  if (!el) return
  el.querySelectorAll('pre').forEach((pre) => {
    if (pre.closest('.bros-code')) return
    const wrap = document.createElement('div')
    wrap.className = 'bros-code'
    const bar = document.createElement('div')
    bar.className = 'bros-code__bar'
    const label = document.createElement('span')
    label.className = 'bros-code__label'
    const lang = [...pre.classList].find((c) => c.startsWith('language-'))
    label.textContent = lang ? lang.slice('language-'.length) : 'code'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'bros-code__copy'
    btn.setAttribute('aria-label', 'Copy code')
    btn.title = 'Copy'
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
    btn.addEventListener('click', async () => {
      const text = pre.textContent || ''
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      btn.setAttribute('aria-label', 'Copied')
      btn.title = 'Copied'
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
      window.setTimeout(() => {
        btn.setAttribute('aria-label', 'Copy code')
        btn.title = 'Copy'
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
      }, 1500)
    })
    bar.append(label, btn)
    pre.parentNode?.insertBefore(wrap, pre)
    wrap.append(bar, pre)
  })
}

onMounted(() => {
  nextTick(decorateFences)
  if (!root.value || !import.meta.client) return
  const observer = new MutationObserver(() => decorateFences())
  observer.observe(root.value, { childList: true, subtree: true })
  onBeforeUnmount(() => observer.disconnect())
})
onUpdated(() => nextTick(decorateFences))
watch(source, () => {
  nextTick(() => nextTick(decorateFences))
})
</script>

<template>
  <div ref="root" class="bros-chat-md prose prose-invert prose-sm max-w-none">
    <MDC v-if="source.trim()" :value="source" tag="div" class="bros-chat-md__body" />
  </div>
</template>

<style scoped>
.bros-chat-md :deep(.bros-chat-md__body) {
  color: var(--bros-text);
}

.bros-chat-md :deep(a) {
  color: var(--bros-accent);
}

.bros-chat-md :deep(p) {
  margin: 0.35em 0;
}

.bros-chat-md :deep(p:first-child) {
  margin-top: 0;
}

.bros-chat-md :deep(p:last-child) {
  margin-bottom: 0;
}

.bros-chat-md :deep(:not(pre) > code) {
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--bros-surface) 80%, black);
  padding: 0.1em 0.35em;
  font-size: 0.9em;
}

.bros-chat-md :deep(.bros-code) {
  overflow: hidden;
  margin: 0.75rem 0;
  border: 1px solid var(--bros-border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--bros-surface) 70%, #0a1016);
}

.bros-chat-md :deep(.bros-code__bar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.65rem;
  border-bottom: 1px solid var(--bros-border);
  background: color-mix(in srgb, var(--bros-surface) 55%, #0a1016);
}

.bros-chat-md :deep(.bros-code__label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  color: var(--bros-muted);
}

.bros-chat-md :deep(.bros-code__copy) {
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

.bros-chat-md :deep(.bros-code__copy:hover),
.bros-chat-md :deep(.bros-code__copy:focus-visible) {
  color: var(--bros-accent-2);
  background: color-mix(in srgb, var(--bros-accent-2) 12%, transparent);
}

.bros-chat-md :deep(.bros-code pre) {
  margin: 0;
  overflow-x: auto;
  padding: 0.85rem 1rem 1rem;
  font-size: 0.8rem;
  line-height: 1.5;
}
</style>
