<script setup lang="ts">
import { isShellBin } from '../shared/shellBins'
import { listedPackageApp, listedDockerApp } from '../utils/gui'

useSeoMeta({ title: 'Terminal' })

type DockerAppCli = {
  id: string
  name: string
  disabled?: boolean
  interfaces: Array<{ type: string; command?: string; bin?: string }>
}

const term = ref<HTMLIFrameElement | null>(null)
const termBox = ref<HTMLElement | null>(null)

function onResizeStart(ev: PointerEvent) {
  const box = termBox.value
  if (!box) return
  ev.preventDefault()
  const startY = ev.clientY
  const startH = box.getBoundingClientRect().height
  const handle = ev.currentTarget as HTMLElement
  const move = (e: PointerEvent) => {
    box.style.height = `${Math.max(192, startH + e.clientY - startY)}px`
  }
  const up = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', up)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', up)
  try { handle.setPointerCapture(ev.pointerId) } catch { /* untrusted pointer */ }
}
const termSrc = `/terminal/session/?fontSize=16&fontFamily=${encodeURIComponent('ui-monospace, "DejaVu Sans Mono", "Liberation Mono", Menlo, Consolas, monospace')}`
const frameSrc = ref(import.meta.server || (import.meta.client && useNuxtApp().isHydrating) ? termSrc : '')

const { data: dockerApps } = await useFetch<{ docker: DockerAppCli[] }>('/api/apps')

type AppPack = {
  id: string
  name?: string
  bin?: string
  enabled?: boolean
  clis?: string[]
  interfaces?: Array<{ type: string; command?: string }>
}

const { data: appPacks } = await useFetch<{ packages: AppPack[] }>('/api/cli/packages')

function appCommands(pkg: AppPack): string[] {
  const fromIface = (pkg.interfaces || [])
    .filter((row) => row.type === 'cli')
    .flatMap((row) => (row.command || '').split(',').map((name) => name.trim()).filter(Boolean))
  const names = fromIface.length ? fromIface : [pkg.bin, ...(pkg.clis || [])].filter((name): name is string => !!name)
  const out: string[] = []
  for (const name of names) {
    if (!name || isShellBin(name) || out.includes(name)) continue
    out.push(name)
  }
  return out
}

const cliNames = computed(() => {
  const names: string[] = []
  for (const s of (dockerApps.value?.docker || []).filter(listedDockerApp)) {
    for (const iface of s.interfaces.filter((row) => row.type === 'cli')) {
      const command = iface.bin || iface.command
      if (!command) continue
      const base = command.split('/').pop() || command
      if (isShellBin(base) || names.includes(base)) continue
      names.push(base)
    }
  }
  for (const pkg of (appPacks.value?.packages || []).filter(listedPackageApp)) {
    for (const name of appCommands(pkg)) {
      if (names.includes(name)) continue
      names.push(name)
    }
  }
  return names
})

function styleTerm() {
  const doc = term.value?.contentDocument
  if (!doc?.head) return false
  try {
    if (!doc.location.href.includes('/terminal/session')) return false
  } catch {
    return false
  }
  if (doc.getElementById('bros-term-style')) return true
  const style = doc.createElement('style')
  style.id = 'bros-term-style'
  style.textContent = `
    html, body { background: #141a22; margin: 0; }
    .xterm, .xterm-viewport {
      scrollbar-width: thin;
      scrollbar-color: rgba(139, 156, 179, 0.55) transparent;
    }
    .xterm::-webkit-scrollbar, .xterm-viewport::-webkit-scrollbar { width: 8px; height: 8px; }
    .xterm::-webkit-scrollbar-track, .xterm-viewport::-webkit-scrollbar-track { background: transparent; }
    .xterm::-webkit-scrollbar-thumb, .xterm-viewport::-webkit-scrollbar-thumb {
      background: rgba(139, 156, 179, 0.55);
      border-radius: 999px;
    }
    .xterm::-webkit-scrollbar-button, .xterm-viewport::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
  `
  doc.head.appendChild(style)
  return true
}

function termAlive() {
  const doc = term.value?.contentDocument
  if (!doc) return false
  try {
    if (!doc.location.href.includes('/terminal/session')) return false
  } catch {
    return false
  }
  return !!doc.querySelector('.xterm')
}

let termTries = 0

function onTermLoad() {
  if (termAlive()) {
    styleTerm()
    return
  }
  let href = ''
  try { href = term.value?.contentWindow?.location.href || '' } catch { return }
  if (!href.includes('/terminal/session') || termTries >= 8) return
  termTries += 1
  const attempt = termTries
  setTimeout(() => {
    if (termAlive()) return
    frameSrc.value = `${termSrc}&r=${attempt}`
  }, 400)
}

onMounted(async () => {
  if (!frameSrc.value) {
    await nextTick()
    frameSrc.value = termSrc
  }
  let n = 0
  const tick = () => {
    if (termAlive()) {
      styleTerm()
      return
    }
    if (n++ > 40) return
    setTimeout(tick, 150)
  }
  tick()
})
</script>

<template>
  <BrosPageShell>
    <div ref="termBox" class="bros-term mb-4">
      <iframe
        ref="term"
        :src="frameSrc || undefined"
        title="CLI terminal"
        class="block min-h-0 w-full flex-1 rounded-lg border border-[var(--bros-border)] bg-[#141a22]"
        @load="onTermLoad"
      />
      <button type="button" class="bros-term__resize" aria-label="Resize terminal" @pointerdown="onResizeStart" />
    </div>
    <p class="text-sm text-[var(--bros-muted)]">
      <span class="font-mono text-xs">{{ cliNames.length ? cliNames.join(', ') : 'No CLIs on PATH yet' }}</span>
      <span class="mx-2">·</span>
      Configure on
      <NuxtLink to="/settings/desktop/apps" class="text-white underline">Desktop apps</NuxtLink>.
    </p>
  </BrosPageShell>
</template>

<style scoped>
.bros-term {
  display: flex;
  flex-direction: column;
  height: 70vh;
  min-height: 12rem;
}

.bros-term__resize {
  position: relative;
  height: 0.5rem;
  margin-top: 0.35rem;
  flex: none;
  cursor: ns-resize;
  border: 0;
  padding: 0;
  background: transparent;
}

.bros-term__resize::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2.5rem;
  height: 0.25rem;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  background: rgba(139, 156, 179, 0.45);
}
</style>
