<script setup lang="ts">
export type CliAppExpose = {
  type: 'webui' | 'api' | 'openai' | 'cli' | 'gui'
  command: string
  args: string
  containerPort: string
  publish: string
  basePath: string
}

export type CliManagerForm = {
  kind: string
  args: boolean
  suggest: boolean
  specLabel: string
  placeholder: string
}

export type CliAppDraft = {
  kind: string
  spec: string
  args: string
  interfaces: CliAppExpose[]
  volumes: string
  home: string
}

const props = defineProps<{
  open: boolean
  editing: boolean
  initial: CliAppDraft | null
  busy: boolean
  error: string
  managers: CliManagerForm[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [draft: Omit<CliAppDraft, 'home'> & { home: string[] }]
  remove: []
}>()

const kind = ref('npm')
const spec = ref('')
const args = ref('')
const interfaces = ref<CliAppExpose[]>([])
const volumes = ref('')
const home = ref('')
const cliAuto = ref(true)
const addTypes = [
  { label: 'gui', value: 'gui' },
  { label: 'webui', value: 'webui' },
  { label: 'api', value: 'api' },
  { label: 'openapi', value: 'openai' },
]
const suggestions = ref<string[]>([])
let suggestTimer: ReturnType<typeof setTimeout> | undefined
let suggestSeq = 0
let pickedSpec = ''
const kindItems = computed(() => props.managers.map((manager) => ({ label: manager.kind, value: manager.kind })))
const currentManager = computed(() => props.managers.find((manager) => manager.kind === kind.value))

function labelFor(nextKind: string, nextSpec: string) {
  if (nextKind === 'nix') {
    const hash = nextSpec.indexOf('#')
    return hash >= 0 ? nextSpec.slice(hash + 1) : nextSpec
  }
  if (nextKind === 'run' || nextKind === 'deb') return ''
  if (nextKind === 'deno') {
    const bare = nextSpec.slice(nextSpec.indexOf(':') + 1)
    const slash = bare.lastIndexOf('/')
    const name = slash >= 0 ? bare.slice(slash + 1) : bare
    const at = name.indexOf('@')
    return at === -1 ? name : name.slice(0, at)
  }
  if (nextSpec.startsWith('@')) {
    const slash = nextSpec.indexOf('/')
    const rest = nextSpec.slice(slash + 1)
    const at = rest.indexOf('@')
    return at === -1 ? nextSpec : nextSpec.slice(0, slash + 1 + at)
  }
  const at = nextSpec.indexOf('@')
  return at === -1 ? nextSpec : nextSpec.slice(0, at)
}

function blankRow(type: CliAppExpose['type']): CliAppExpose {
  return { type, command: '', args: '', containerPort: '', publish: '', basePath: '' }
}

watch(() => props.open, (open) => {
  suggestions.value = []
  pickedSpec = ''
  if (!open) return
  kind.value = props.initial?.kind || 'npm'
  spec.value = props.initial?.spec || ''
  args.value = props.initial?.args || ''
  const rows = (props.initial?.interfaces || []).map((row) => ({ ...blankRow(row.type), ...row }))
  if (!rows.some((row) => row.type === 'cli')) rows.unshift(blankRow('cli'))
  interfaces.value = rows
  volumes.value = props.initial?.volumes || ''
  home.value = props.initial?.home || ''
  const cli = rows.find((row) => row.type === 'cli')
  const label = labelFor(kind.value, spec.value)
  cliAuto.value = !cli?.command || cli.command === label
})

function onCliInput(value: string) {
  const cli = interfaces.value.find((row) => row.type === 'cli')
  if (cli) cli.command = value
  if (value === labelFor(kind.value, spec.value)) return
  cliAuto.value = false
}

watch([kind, spec], () => {
  if (cliAuto.value) {
    const cli = interfaces.value.find((row) => row.type === 'cli')
    if (cli) cli.command = labelFor(kind.value, spec.value)
  }
  clearTimeout(suggestTimer)
  const currentKind = kind.value
  const q = spec.value.trim()
  const manager = props.managers.find((row) => row.kind === currentKind)
  if (!manager?.suggest || q.length < 2 || q === pickedSpec) {
    suggestions.value = []
    return
  }
  suggestTimer = setTimeout(async () => {
    const seq = ++suggestSeq
    try {
      const res = await $fetch<{ names: string[] }>('/api/cli/suggest', { query: { kind: currentKind, q } })
      if (seq !== suggestSeq) return
      suggestions.value = res.names.filter((name) => name !== q)
    } catch {
      if (seq === suggestSeq) suggestions.value = []
    }
  }, 200)
})

function pickSuggestion(name: string) {
  pickedSpec = name
  spec.value = name
  suggestions.value = []
  suggestSeq += 1
}

const specLabel = computed(() => currentManager.value?.specLabel || 'Package')
const specPlaceholder = computed(() => currentManager.value?.placeholder || '')
const canSave = computed(() => !!spec.value.trim())

function onSave() {
  emit('save', {
    kind: kind.value,
    spec: spec.value.trim(),
    args: currentManager.value?.args ? args.value.trim() : '',
    interfaces: interfaces.value.map((row) => ({
      type: row.type,
      command: row.command.trim(),
      args: row.type === 'gui' ? row.args.trim() : '',
      containerPort: row.containerPort.trim(),
      publish: row.publish.trim(),
      basePath: row.basePath.trim(),
    })),
    volumes: volumes.value.trim(),
    home: home.value.split('\n').map((line) => line.trim()).filter(Boolean),
  })
}

function addInterface() {
  interfaces.value = [...interfaces.value, blankRow('gui')]
}

function dropInterface(index: number) {
  interfaces.value = interfaces.value.filter((_, i) => i !== index)
}
</script>

<template>
  <UModal
    :open="open"
    :title="editing ? 'Edit app' : 'Add app'"
    :description="editing ? 'Change this app on the CLI sidecar.' : 'Install an app on the CLI sidecar.'"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <form id="cli-app-form" class="grid gap-3" @submit.prevent="onSave">
        <label class="text-sm text-[var(--bros-muted)]">
          Type
          <USelect v-model="kind" :items="kindItems" class="mt-1 w-full" />
        </label>
        <label class="text-sm text-[var(--bros-muted)]">
          {{ specLabel }}
          <UInput v-model="spec" class="mt-1" :placeholder="specPlaceholder" autocomplete="off" />
          <ul v-if="suggestions.length" class="mt-1 max-h-36 overflow-auto rounded-md border border-[var(--bros-border)]">
            <li v-for="name in suggestions" :key="name">
              <button
                type="button"
                class="block w-full truncate px-2 py-1 text-left font-mono text-sm text-white hover:bg-[var(--bros-surface)]"
                @click="pickSuggestion(name)"
              >
                {{ name }}
              </button>
            </li>
          </ul>
        </label>
        <label v-if="currentManager?.args" class="text-sm text-[var(--bros-muted)]">
          Args
          <UInput v-model="args" class="mt-1" placeholder="optional flags" />
        </label>
        <label class="text-sm text-[var(--bros-muted)]">
          Volumes
          <UTextarea v-model="volumes" class="mt-1 font-mono" :rows="2" placeholder="host:container, one per line" />
        </label>
        <label class="text-sm text-[var(--bros-muted)]">
          Home
          <UTextarea v-model="home" class="mt-1 font-mono" :rows="2" placeholder=".config/app, one relative path per line" />
        </label>
        <div class="grid gap-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-[var(--bros-muted)]">Interfaces</span>
            <UButton type="button" size="xs" color="neutral" variant="ghost" @click="addInterface">Add</UButton>
          </div>
          <div v-for="(row, index) in interfaces" :key="index" class="grid gap-2 rounded-md border border-[var(--bros-border)] p-2">
            <span v-if="row.type === 'cli'" class="text-sm text-white">cli</span>
            <USelect v-else v-model="row.type" :items="addTypes" />
            <UInput
              v-if="row.type === 'cli'"
              :model-value="row.command"
              placeholder="command, other"
              @update:model-value="onCliInput"
            />
            <UInput v-else-if="row.type === 'gui'" v-model="row.command" placeholder="command" />
            <UInput v-if="row.type === 'gui'" v-model="row.args" placeholder="launch args" />
            <UInput v-if="row.type === 'webui' || row.type === 'api' || row.type === 'openai'" v-model="row.containerPort" placeholder="container port" />
            <UInput v-if="row.type === 'webui' || row.type === 'api' || row.type === 'openai'" v-model="row.publish" placeholder="publish port" />
            <UInput v-if="row.type === 'api' || row.type === 'openai' || row.type === 'webui'" v-model="row.basePath" placeholder="base path" />
            <UButton v-if="row.type !== 'cli'" type="button" size="xs" color="error" variant="ghost" @click="dropInterface(index)">Remove</UButton>
          </div>
        </div>
        <p v-if="kind === 'run'" class="text-xs text-[var(--bros-muted)]">Command runs as written, one line.</p>
        <p v-if="kind === 'deb'" class="text-xs text-[var(--bros-muted)]">https URL. apt installs the file. A /latest path tag can be checked for updates.</p>
        <p v-if="error" class="text-sm text-amber-300">{{ error }}</p>
      </form>
    </template>
    <template #footer>
      <UButton type="button" :loading="busy" :disabled="!canSave" @click="onSave">
        {{ editing ? 'Save' : 'Add' }}
      </UButton>
      <UButton v-if="editing" color="error" variant="ghost" :disabled="busy" @click="emit('remove')">Remove</UButton>
    </template>
  </UModal>
</template>
