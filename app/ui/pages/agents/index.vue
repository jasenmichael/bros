<script setup lang="ts">
useSeoMeta({ title: 'Agents' })

type Mask = { set: boolean, last4: string }
type TaskSpec = { title: string, kind: string, summary: string, steps: string[] }
type Project = {
  name: string
  cwd: string
  path: string
  prBase: 'staging' | 'main'
  fullName: string | null
  defaultBranch: string
  enabled: boolean
  promotionUrl: string | null
  error: string | null
}
type Issue = {
  project: string
  fullName: string | null
  number: number
  title: string
  kind: string
  jobId: string | null
  jobState: string | null
  step: string
}
type Job = {
  id: string
  project: string
  issueNumber: number
  state: string
  kind: string
  title: string
  branch: string | null
  prUrl: string | null
  error: string | null
  taskSpec: TaskSpec | null
}
type Board = {
  runtime: 'cursor' | 'claude'
  cursorKey: Mask
  githubToken: Mask
  preflightModel: string
  autoPreflight: boolean
  autoApprove: boolean
  autoApprovePr: boolean
  deleteBranch: boolean
  models: string[]
  apps: { cursor: boolean, claude: boolean }
  workspace: string
  projects: Project[]
  issues: Issue[]
  jobs: Job[]
  errors: Array<{ fullName: string, error: string }>
}
type EventRow = { id: string, kind: string, message: string, createdAt: number }

const { data, refresh } = await useFetch<Board>('/api/agents', { key: 'bros-agents' })
const kind = ref('all')
const busy = ref(false)
const notice = ref('')
const cursorKey = ref('')
const githubToken = ref('')
const openId = ref('')
const events = ref<EventRow[]>([])
const specs = reactive<Record<string, string>>({})
const dirty = reactive<Record<string, boolean>>({})

const draft = reactive({
  runtime: 'cursor' as 'cursor' | 'claude',
  preflightModel: '',
  autoPreflight: true,
  autoApprove: false,
  autoApprovePr: false,
  deleteBranch: true,
})
const seen = reactive({ ...draft })

function take<K extends keyof typeof seen>(key: K, next: (typeof seen)[K]) {
  if (draft[key] === seen[key]) draft[key] = next
  seen[key] = next
}
const addFullName = ref('')
const addBranch = ref('main')
const addPath = ref('')
const editName = ref('')
const editDraft = reactive({
  defaultBranch: 'main',
  path: '',
  enabled: true,
  prBase: 'staging' as 'staging' | 'main',
})

watch(data, (row) => {
  if (!row) return
  take('runtime', row.runtime)
  take('preflightModel', row.preflightModel)
  take('autoPreflight', row.autoPreflight)
  take('autoApprove', row.autoApprove)
  take('autoApprovePr', row.autoApprovePr)
  take('deleteBranch', row.deleteBranch)
  for (const job of row.jobs) {
    if (dirty[job.id] || !job.taskSpec) continue
    specs[job.id] = JSON.stringify(job.taskSpec, null, 2)
  }
}, { immediate: true })

if (import.meta.client) {
  const timer = setInterval(() => { void refresh() }, 2000)
  onUnmounted(() => clearInterval(timer))
}

const kinds = computed(() => {
  const names = new Set((data.value?.issues || []).map((issue) => issue.kind).filter(Boolean))
  return ['all', ...names]
})
const runtimeItems = [
  { label: 'Cursor', value: 'cursor' },
  { label: 'Claude', value: 'claude' },
]
const prBaseItems = [
  { label: 'staging', value: 'staging' },
  { label: 'main', value: 'main' },
]
const modelItems = computed(() => (data.value?.models || []).filter(Boolean))

const issues = computed(() => {
  const rows = data.value?.issues || []
  return kind.value === 'all' ? rows : rows.filter((issue) => issue.kind === kind.value)
})

const jobs = computed(() => data.value?.jobs || [])
const needsYou = computed(() => jobs.value.filter((job) => job.state === 'awaiting_approval' || job.state === 'awaiting_pr'))
const queue = computed(() => jobs.value.filter((job) => ['queued', 'planning', 'implementing', 'committing', 'creating_pr'].includes(job.state)))
const failed = computed(() => jobs.value.filter((job) => ['failed', 'timed_out', 'cancelled'].includes(job.state)))
const completed = computed(() => jobs.value.filter((job) => job.state === 'completed'))

function canStart(state: string | null) {
  if (!state) return true
  return ['completed', 'failed', 'timed_out', 'cancelled'].includes(state)
}

function api(url: string, init?: { method?: string, body?: unknown }) {
  return fetch(url, {
    method: init?.method,
    headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  }).then(async (res) => {
    if (!res.ok) throw new Error(await res.text() || res.statusText)
    return res.json()
  })
}

async function act(fn: () => Promise<unknown>) {
  busy.value = true
  notice.value = ''
  try {
    await fn()
    await refresh()
  }
  catch (error) {
    notice.value = error instanceof Error ? error.message : 'request failed'
  }
  finally {
    busy.value = false
  }
}

function start(issue: Issue) {
  return act(() => api('/api/agents/jobs', {
    method: 'POST',
    body: { project: issue.project, issueNumber: issue.number },
  }))
}

function approve(job: Job) {
  return act(async () => {
    await api(`/api/agents/jobs/${job.id}/action`, {
      method: 'POST',
      body: { action: 'approve', taskSpec: specs[job.id] || '' },
    })
    dirty[job.id] = false
  })
}

function approvePr(job: Job) {
  return act(() => api(`/api/agents/jobs/${job.id}/action`, {
    method: 'POST',
    body: { action: 'approve_pr' },
  }))
}

function cancel(job: Job) {
  return act(() => api(`/api/agents/jobs/${job.id}/action`, {
    method: 'POST',
    body: { action: 'cancel' },
  }))
}

function clearJob(job: Job) {
  return act(() => api(`/api/agents/jobs/${job.id}`, { method: 'DELETE' }))
}

async function look(job: Job) {
  if (openId.value === job.id) {
    openId.value = ''
    return
  }
  const row = await api(`/api/agents/jobs/${job.id}`) as { events: EventRow[] }
  events.value = row.events
  openId.value = job.id
}

function addProject() {
  return act(async () => {
    await api('/api/agents/projects', {
      method: 'POST',
      body: { fullName: addFullName.value, defaultBranch: addBranch.value, path: addPath.value },
    })
    addFullName.value = ''
    addBranch.value = 'main'
    addPath.value = ''
  })
}

function startEdit(project: Project) {
  if (editName.value === project.name) {
    editName.value = ''
    return
  }
  editName.value = project.name
  editDraft.defaultBranch = project.defaultBranch
  editDraft.path = project.path
  editDraft.enabled = project.enabled
  editDraft.prBase = project.prBase
}

function saveProject() {
  return act(async () => {
    await api(`/api/agents/projects/${editName.value}`, { method: 'PATCH', body: { ...editDraft } })
    editName.value = ''
  })
}

function removeProject() {
  return act(async () => {
    await api(`/api/agents/projects/${editName.value}`, { method: 'DELETE' })
    editName.value = ''
  })
}

function saveSettings() {
  return act(async () => {
    const body: Record<string, unknown> = { ...draft }
    if (cursorKey.value.trim()) body.cursorKey = cursorKey.value.trim()
    if (githubToken.value.trim()) body.githubToken = githubToken.value.trim()
    await api('/api/agents', { method: 'PUT', body })
    cursorKey.value = ''
    githubToken.value = ''
  })
}

function clearToken(which: 'github' | 'cursor') {
  return act(() => api('/api/agents', {
    method: 'PUT',
    body: which === 'github' ? { githubTokenClear: true } : { cursorKeyClear: true },
  }))
}
</script>

<template>
  <BrosPageShell title="Agents" description="GitHub issues, approvals, and the Desktop agent that implements them.">
    <p v-if="notice" class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{{ notice }}</p>
    <div v-if="data?.errors?.length" class="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      <p v-for="err in data.errors" :key="err.fullName">{{ err.fullName }}: {{ err.error }}</p>
    </div>

    <div class="mb-6 grid gap-4 xl:grid-cols-2">
      <section class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-medium text-white">Issues</h2>
          <div class="flex items-center gap-2">
            <USelect v-model="kind" :items="kinds" size="sm" class="w-28" />
            <UButton size="sm" color="neutral" variant="outline" @click="() => refresh()">Refresh</UButton>
          </div>
        </div>
        <p v-if="!issues.length" class="text-sm text-[var(--bros-muted)]">No open issues.</p>
        <ul v-else class="space-y-3">
          <li v-for="issue in issues" :key="`${issue.project}-${issue.number}`" class="border-t border-[var(--bros-border)] pt-3 first:border-0 first:pt-0">
            <p class="text-sm text-white">{{ issue.fullName || issue.project }} #{{ issue.number }}</p>
            <p class="text-sm text-[var(--bros-muted)]">{{ issue.kind }} · {{ issue.title }}</p>
            <UButton
              type="button"
              class="mt-2"
              size="sm"
              :disabled="busy || !canStart(issue.jobState)"
              @click="start(issue)"
            >
              {{ canStart(issue.jobState) ? 'start ' + issue.step : issue.jobState }}
            </UButton>
          </li>
        </ul>
      </section>

      <section class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-4">
        <h2 class="mb-3 text-lg font-medium text-white">Needs you</h2>
        <p v-if="!needsYou.length" class="text-sm text-[var(--bros-muted)]">No jobs waiting. Start an issue, then edit the Task Spec here before Approve implement.</p>
        <ul v-else class="space-y-4">
          <li v-for="job in needsYou" :key="job.id">
            <p class="text-sm text-white">{{ job.project }} #{{ job.issueNumber }} · {{ job.title }}</p>
            <template v-if="job.state === 'awaiting_approval'">
              <textarea
                v-model="specs[job.id]"
                class="mt-2 min-h-28 w-full rounded-md border border-[var(--bros-border)] bg-transparent p-2 font-mono text-xs text-white"
                @input="dirty[job.id] = true"
              />
              <div class="mt-2 flex gap-2">
                <UButton size="sm" :disabled="busy" @click="approve(job)">Approve implement</UButton>
                <UButton size="sm" color="neutral" variant="outline" :disabled="busy" @click="cancel(job)">Cancel</UButton>
              </div>
            </template>
            <div v-else class="mt-2 flex gap-2">
              <UButton size="sm" :disabled="busy" @click="approvePr(job)">Approve PR</UButton>
              <UButton size="sm" color="neutral" variant="outline" :disabled="busy" @click="cancel(job)">Cancel</UButton>
            </div>
          </li>
        </ul>
      </section>

      <section class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-4">
        <h2 class="mb-3 text-lg font-medium text-white">Queue</h2>
        <p v-if="!queue.length" class="text-sm text-[var(--bros-muted)]">Nothing running.</p>
        <ul v-else class="space-y-3">
          <li v-for="job in queue" :key="job.id">
            <p class="text-sm text-white">{{ job.project }} #{{ job.issueNumber }} · {{ job.state }}</p>
            <UButton class="mt-2" size="sm" color="neutral" variant="outline" @click="look(job)">Look in</UButton>
            <pre v-if="openId === job.id" class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-[var(--bros-muted)]">{{ events.map((row) => `${row.kind}: ${row.message}`).join('\n') }}</pre>
          </li>
        </ul>
      </section>

      <section class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-4">
        <h2 class="mb-3 text-lg font-medium text-white">Failed</h2>
        <p v-if="!failed.length" class="text-sm text-[var(--bros-muted)]">No failed jobs.</p>
        <ul v-else class="space-y-3">
          <li v-for="job in failed" :key="job.id">
            <p class="text-sm text-white">{{ job.project }} #{{ job.issueNumber }} · {{ job.state }}</p>
            <p v-if="job.error" class="text-xs text-red-300">{{ job.error }}</p>
            <UButton class="mt-2" size="sm" color="neutral" variant="outline" :disabled="busy" @click="clearJob(job)">Clear</UButton>
          </li>
        </ul>
      </section>

      <section class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-4 xl:col-span-2">
        <h2 class="mb-3 text-lg font-medium text-white">Completed</h2>
        <p v-if="!completed.length" class="text-sm text-[var(--bros-muted)]">No completed jobs.</p>
        <ul v-else class="space-y-3">
          <li v-for="job in completed" :key="job.id">
            <p class="text-sm text-white">{{ job.project }} #{{ job.issueNumber }} · {{ job.title }}</p>
            <a v-if="job.prUrl" class="text-sm text-[var(--bros-muted)] underline" :href="job.prUrl" target="_blank" rel="noreferrer">{{ job.prUrl }}</a>
            <UButton class="mt-2" size="sm" color="neutral" variant="outline" @click="look(job)">Look in</UButton>
            <pre v-if="openId === job.id" class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-[var(--bros-muted)]">{{ events.map((row) => `${row.kind}: ${row.message}`).join('\n') }}</pre>
          </li>
        </ul>
      </section>
    </div>

    <section class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
      <h2 class="text-lg font-medium text-white">Add project</h2>
      <form class="mt-4 flex flex-wrap items-end gap-3" @submit.prevent="addProject">
        <label class="block text-sm text-[var(--bros-muted)]">
          owner/name
          <input v-model="addFullName" required placeholder="acme/app" class="mt-1 w-44 rounded-md border border-[var(--bros-border)] bg-transparent px-2 py-1 text-white">
        </label>
        <label class="block text-sm text-[var(--bros-muted)]">
          Default branch
          <input v-model="addBranch" required placeholder="main" class="mt-1 w-32 rounded-md border border-[var(--bros-border)] bg-transparent px-2 py-1 text-white">
        </label>
        <label class="block min-w-64 flex-1 text-sm text-[var(--bros-muted)]">
          Path
          <input v-model="addPath" :placeholder="`${data?.workspace || '/home/bros/workspace'}/name`" class="mt-1 w-full rounded-md border border-[var(--bros-border)] bg-transparent px-2 py-1 text-white">
        </label>
        <UButton type="submit" :disabled="busy">Add</UButton>
      </form>

      <h2 class="mt-8 text-lg font-medium text-white">Projects</h2>
      <p v-if="!data?.projects?.length" class="mt-2 text-sm text-[var(--bros-muted)]">None yet.</p>
      <table v-else class="mt-3 w-full text-left text-sm">
        <thead class="text-[var(--bros-muted)]">
          <tr>
            <th class="py-2 pr-3 font-medium">Repo</th>
            <th class="py-2 pr-3 font-medium">Branch</th>
            <th class="py-2 pr-3 font-medium">staging → main</th>
            <th class="py-2 pr-3 font-medium">Enabled</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <template v-for="project in data.projects" :key="project.name">
            <tr class="border-t border-[var(--bros-border)]">
              <td class="py-2 pr-3 text-white">{{ project.fullName || project.name }}</td>
              <td class="py-2 pr-3 text-[var(--bros-muted)]">{{ project.defaultBranch }}</td>
              <td class="py-2 pr-3">
                <a v-if="project.promotionUrl" class="text-[var(--bros-muted)] underline" :href="project.promotionUrl" target="_blank" rel="noreferrer">open</a>
                <span v-else class="text-[var(--bros-muted)]">—</span>
              </td>
              <td class="py-2 pr-3 text-[var(--bros-muted)]">{{ project.enabled ? 'yes' : 'no' }}</td>
              <td class="py-2 text-right">
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" @click="startEdit(project)">Edit</UButton>
              </td>
            </tr>
            <tr v-if="editName === project.name" class="border-t border-[var(--bros-border)]">
              <td colspan="5" class="py-3">
                <form class="grid gap-3 md:grid-cols-2" @submit.prevent="saveProject">
                  <label class="block text-sm text-[var(--bros-muted)]">
                    Default branch
                    <input v-model="editDraft.defaultBranch" required class="mt-1 w-full rounded-md border border-[var(--bros-border)] bg-transparent px-2 py-1 text-white">
                  </label>
                  <label class="block text-sm text-[var(--bros-muted)]">
                    Path
                    <input v-model="editDraft.path" class="mt-1 w-full rounded-md border border-[var(--bros-border)] bg-transparent px-2 py-1 text-white">
                  </label>
                  <label class="flex items-center justify-between gap-3 text-sm text-white">Enabled <USwitch v-model="editDraft.enabled" /></label>
                  <label class="block text-sm text-[var(--bros-muted)]">
                    Issue branch to
                    <USelect v-model="editDraft.prBase" :items="prBaseItems" size="sm" class="mt-1 w-full" />
                  </label>
                  <div class="flex flex-wrap gap-2 md:col-span-2">
                    <UButton type="submit" size="sm" :disabled="busy">Save</UButton>
                    <UButton type="button" size="sm" color="neutral" variant="outline" @click="() => { editName = '' }">Cancel</UButton>
                    <UButton type="button" size="sm" color="neutral" variant="outline" :disabled="busy" @click="removeProject">Remove</UButton>
                  </div>
                </form>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>

    <section class="mt-6 rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
      <details>
        <summary class="cursor-pointer text-lg font-medium text-white">Runtime</summary>
        <p v-if="draft.runtime === 'claude' && !data?.apps.claude" class="mt-4 text-sm text-amber-100">
          Claude is a Desktop image layer. Enable it, then rebuild Desktop.
          <NuxtLink class="underline" to="/settings/desktop/apps">Desktop apps</NuxtLink>
        </p>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <label class="block text-sm text-[var(--bros-muted)]">
            Runtime
            <USelect v-model="draft.runtime" :items="runtimeItems" size="sm" class="mt-1 w-full" />
          </label>
          <label class="block text-sm text-[var(--bros-muted)]">
            Preflight model
            <USelect v-model="draft.preflightModel" :items="modelItems" placeholder="Select a model" size="sm" class="mt-1 w-full" />
          </label>
          <label class="block text-sm text-[var(--bros-muted)]">
            Cursor API key
            <input v-model="cursorKey" type="password" autocomplete="off" class="mt-1 w-full rounded-md border border-[var(--bros-border)] bg-transparent px-2 py-1 text-white" :placeholder="data?.cursorKey.set ? `set · ${data.cursorKey.last4}` : 'unset'">
            <UButton v-if="data?.cursorKey.set" class="mt-2" size="xs" color="neutral" variant="outline" @click="clearToken('cursor')">Clear</UButton>
          </label>
          <label class="block text-sm text-[var(--bros-muted)]">
            GitHub token
            <input v-model="githubToken" type="password" autocomplete="off" class="mt-1 w-full rounded-md border border-[var(--bros-border)] bg-transparent px-2 py-1 text-white" :placeholder="data?.githubToken.set ? `set · ${data.githubToken.last4}` : 'unset'">
            <UButton v-if="data?.githubToken.set" class="mt-2" size="xs" color="neutral" variant="outline" @click="clearToken('github')">Clear</UButton>
          </label>
        </div>
        <div class="mt-4 space-y-3">
          <label class="flex items-center justify-between gap-3 text-sm text-white">Auto preflight <USwitch v-model="draft.autoPreflight" /></label>
          <label class="flex items-center justify-between gap-3 text-sm text-white">Auto-approve implement <USwitch v-model="draft.autoApprove" /></label>
          <label class="flex items-center justify-between gap-3 text-sm text-white">Auto-approve PR <USwitch v-model="draft.autoApprovePr" /></label>
          <label class="flex items-center justify-between gap-3 text-sm text-white">Delete branch after merge <USwitch v-model="draft.deleteBranch" /></label>
        </div>
        <UButton class="mt-4" :disabled="busy" @click="saveSettings">Save</UButton>
      </details>
    </section>
  </BrosPageShell>
</template>
