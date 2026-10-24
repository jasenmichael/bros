<script setup lang="ts">
type Entry = { id: string, name: string, command: string, icon: string }
type Pack = {
  id: string
  name?: string
  bin?: string
  spec: string
  enabled?: boolean
  interfaces?: Array<{ type: string, command?: string }>
}

const note = ref('')
const busy = ref(false)

const { data: drawer } = useFetch<{ entries: Entry[] }>('/api/desktop/drawer', { key: 'desktop-drawer' })
const { data: packs, refresh: refreshPacks } = useFetch<{ packages: Pack[] }>('/api/cli/packages')
const { data: versions } = useFetch<{ versions: { id: string; version: string }[] }>('/api/apps/versions')

function versionOf(id: string) {
  return versions.value?.versions?.find((row) => row.id === id)?.version || ''
}

function guiCommand(pkg: Pack) {
  return pkg.interfaces?.find((iface) => iface.type === 'gui' && iface.command)?.command || ''
}

function errText(err: unknown) {
  if (err && typeof err === 'object' && 'data' in err) {
    const body = (err as { data?: { statusMessage?: string, message?: string } }).data
    if (body?.message) return body.message
    if (body?.statusMessage) return body.statusMessage
  }
  return err instanceof Error ? err.message : 'Request failed'
}

const tiles = computed(() => (packs.value?.packages || []).flatMap((pkg) => {
  const command = guiCommand(pkg)
  if (!command) return []
  return [{
    id: pkg.id,
    name: pkg.name || pkg.bin || pkg.spec,
    command,
    icon: (drawer.value?.entries || []).find((entry) => entry.command === command)?.icon || '',
    enabled: pkg.enabled !== false,
  }]
}))

async function enable(id: string) {
  busy.value = true
  note.value = ''
  try {
    const saved = await $fetch<{ install?: { code: number, stderr?: string } }>(`/api/apps/${id}/enable`, { method: 'POST' })
    if (saved.install && saved.install.code !== 0) note.value = saved.install.stderr || 'Install failed'
    await refreshPacks()
  } catch (err: unknown) {
    note.value = errText(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="p-4">
    <p v-if="note" class="mb-3 text-sm text-amber-300">{{ note }}</p>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
      <div v-for="tile in tiles" :key="tile.id" class="flex h-36 flex-col items-center justify-center gap-2 rounded-xl border border-[var(--bros-border)] bg-[#0f1419] px-2">
        <DesktopMark :icon="tile.icon" :name="tile.name" />
        <p class="w-full truncate text-center text-sm text-white">{{ tile.name }}</p>
        <p v-if="tile.enabled && versionOf(tile.id)" class="w-full truncate text-center font-mono text-[10px] text-[var(--bros-muted)]">{{ versionOf(tile.id) }}</p>
        <button
          v-if="!tile.enabled"
          type="button"
          class="text-xs text-[var(--bros-accent)]"
          :disabled="busy"
          @click="enable(tile.id)"
        >Enable</button>
        <p v-else class="w-full truncate text-center font-mono text-[10px] text-[var(--bros-muted)]">{{ tile.command }}</p>
      </div>
    </div>
  </div>
</template>
