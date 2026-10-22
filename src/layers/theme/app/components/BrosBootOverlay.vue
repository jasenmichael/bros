<script setup lang="ts">
import { bootOverlayVisible, type BootSidecar } from '../utils/bootOverlay'

const booting = useState('brosBooting', () => false)
if (import.meta.server) {
  const event = useRequestEvent()
  booting.value = event?.context.brosBooting === true
}

const { data: health, refresh: refreshHealth } = useFetch<{ booting?: boolean }>('/api/health', {
  lazy: true,
  server: false,
  dedupe: 'defer',
})

const { data, refresh } = useFetch<{ sidecars?: BootSidecar[] }>('/api/status', {
  lazy: true,
  server: false,
  dedupe: 'defer',
})

const rows = computed(() => (data.value?.sidecars || []).filter((row) => row.autostart && !row.disabled))
const open = computed(() => bootOverlayVisible(
  health.value ? { booting: health.value.booting } : null,
  booting.value,
))

function phaseIcon(phase?: string) {
  if (phase === 'running') return 'i-lucide-check'
  if (phase === 'error') return 'i-lucide-circle-alert'
  return 'i-lucide-loader-circle'
}

onMounted(() => {
  const timer = setInterval(() => {
    if (!open.value) {
      clearInterval(timer)
      return
    }
    refreshHealth()
    refresh()
  }, 2000)
  onUnmounted(() => clearInterval(timer))
})
</script>

<template>
  <div v-if="open" class="bros-boot" role="status" aria-live="polite">
    <div class="bros-boot__panel">
      <p class="bros-boot__title">Starting services</p>
      <ul class="bros-boot__list">
        <li v-for="row in rows" :key="row.id || row.name" class="bros-boot__row">
          <span>{{ row.name }}</span>
          <UIcon
            :name="phaseIcon(row.phase)"
            class="size-4 shrink-0"
            :class="[
              row.phase === 'error' ? 'text-[var(--bros-muted)]' : 'text-[var(--bros-accent)]',
              row.phase === 'running' || row.phase === 'error' ? '' : 'animate-spin',
            ]"
            :aria-label="row.phase || 'starting'"
          />
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.bros-boot {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(15 20 25 / 0.92);
}

.bros-boot__panel {
  width: min(24rem, calc(100vw - 2rem));
  border: 1px solid rgb(139 156 179 / 0.35);
  border-radius: 0.75rem;
  background: #0f1419;
  padding: 1.25rem 1.5rem;
}

.bros-boot__title {
  margin: 0 0 0.75rem;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
}

.bros-boot__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.bros-boot__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.35rem 0;
  color: #fff;
  font-size: 0.875rem;
}

</style>
