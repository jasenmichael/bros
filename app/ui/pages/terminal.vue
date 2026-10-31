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
// Full load: src is in the HTML so the browser starts ttyd during parse.
// Client route: set src after the iframe is in the document. Do not swap src later.
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

const exposeClis = computed(() => (dockerApps.value?.docker || []).filter(listedDockerApp).flatMap((s) => {
  const commands = s.interfaces
    .filter((iface) => iface.type === 'cli')
    .map((iface) => iface.bin || iface.command)
    .filter((command): command is string => !!command && !isShellBin(command.split('/').pop() || command))
  if (!commands.length) return []
  return [{ id: s.id, name: s.name, commands }]
}))

const appClis = computed(() => (appPacks.value?.packages || []).filter(listedPackageApp).flatMap((pkg) => {
  const commands = appCommands(pkg)
  if (!commands.length) return []
  return [{ id: pkg.id, name: pkg.name || pkg.bin || pkg.id, commands }]
}))

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
  <BrosPageShell title="Terminal" description="Shell on the Bros network. DockerApp commands are on PATH.">
    <div ref="termBox" class="bros-term mb-6">
      <iframe
        ref="term"
        :src="frameSrc || undefined"
        title="CLI terminal"
        class="block min-h-0 w-full flex-1 rounded-lg border border-[var(--bros-border)] bg-[#141a22]"
        @load="onTermLoad"
      />
      <button type="button" class="bros-term__resize" aria-label="Resize terminal" @pointerdown="onResizeStart" />
    </div>
    <h2 class="mb-2 text-sm font-medium text-white">Expose CLIs</h2>
    <p v-if="!exposeClis.length" class="mb-6 text-sm text-[var(--bros-muted)]">No docker app CLIs.</p>
    <ul v-else class="mb-6 space-y-2">
      <li
        v-for="row in exposeClis"
        :key="row.id"
        class="rounded-lg border border-[var(--bros-border)] px-3 py-2"
      >
        <span class="text-sm text-white">{{ row.name }}</span>
        <p class="mt-1 font-mono text-xs text-[var(--bros-muted)]">{{ row.commands.join(', ') }}</p>
      </li>
    </ul>
    <h2 class="mb-2 text-sm font-medium text-white">Apps</h2>
    <p v-if="!appClis.length" class="mb-6 text-sm text-[var(--bros-muted)]">No app CLIs.</p>
    <ul v-else class="mb-6 space-y-2">
      <li
        v-for="row in appClis"
        :key="row.id"
        class="rounded-lg border border-[var(--bros-border)] px-3 py-2"
      >
        <span class="text-sm text-white">{{ row.name }}</span>
        <p class="mt-1 font-mono text-xs text-[var(--bros-muted)]">{{ row.commands.join(', ') }}</p>
      </li>
    </ul>
    <p class="text-sm text-[var(--bros-muted)]">
      Apps and packages are configured on <NuxtLink to="/apps" class="text-white underline">Apps</NuxtLink>.
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
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--bros-border);
}

.bros-term__resize:hover::before {
  background: var(--bros-accent);
}
</style>
