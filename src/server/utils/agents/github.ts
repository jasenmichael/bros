import type { PrBase } from './rules'

export type GithubIssue = {
  number: number
  title: string
  labels: string[]
}

export type GithubUser = { name: string, email: string, login: string }

export type GithubPull = {
  number: number
  url: string
  merged: boolean
  open: boolean
}

type Fetch = typeof fetch

function headers(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'bros',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function github<T>(token: string, path: string, init?: RequestInit, fetchImpl: Fetch = fetch): Promise<T> {
  const res = await fetchImpl(`https://api.github.com${path}`, {
    ...init,
    headers: { ...headers(token), ...(init?.headers || {}) },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub ${res.status} ${path}: ${body.slice(0, 200)}`)
  }
  if (res.status === 204) return undefined as T
  return await res.json() as T
}

export async function githubUser(token: string, fetchImpl?: Fetch): Promise<GithubUser> {
  const user = await github<{ login?: string, name?: string | null, email?: string | null }>(token, '/user', undefined, fetchImpl)
  const login = user.login?.trim() || ''
  if (!login) throw new Error('cannot commit without the GitHub user for this token')
  return {
    login,
    name: user.name?.trim() || login,
    email: user.email?.trim() || `${login}@users.noreply.github.com`,
  }
}

export async function listOpenIssues(token: string, owner: string, repo: string, fetchImpl?: Fetch): Promise<GithubIssue[]> {
  const items = await github<Array<{
    number: number
    title: string
    pull_request?: unknown
    labels?: Array<string | { name?: string }>
  }>>(token, `/repos/${owner}/${repo}/issues?state=open&per_page=100`, undefined, fetchImpl)
  return items.filter((item) => !item.pull_request).map((item) => ({
    number: item.number,
    title: item.title,
    labels: (item.labels || []).map((label) => typeof label === 'string' ? label : label.name || '').filter(Boolean),
  }))
}

export async function defaultBranch(token: string, owner: string, repo: string, fetchImpl?: Fetch): Promise<string> {
  const row = await github<{ default_branch?: string }>(token, `/repos/${owner}/${repo}`, undefined, fetchImpl)
  return row.default_branch?.trim() || 'main'
}

export async function openPull(input: {
  token: string
  owner: string
  repo: string
  title: string
  head: string
  base: string
  body: string
}, fetchImpl?: Fetch): Promise<GithubPull> {
  const row = await github<{ number: number, html_url: string }>(input.token, `/repos/${input.owner}/${input.repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      head: input.head,
      base: input.base,
      body: input.body,
    }),
  }, fetchImpl)
  return { number: row.number, url: row.html_url, merged: false, open: true }
}

export async function findOpenPull(token: string, owner: string, repo: string, head: string, base: string, fetchImpl?: Fetch): Promise<GithubPull | null> {
  const items = await github<Array<{ number: number, html_url: string }>>(
    token,
    `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${head}`)}&base=${encodeURIComponent(base)}`,
    undefined,
    fetchImpl,
  )
  const first = items[0]
  if (!first) return null
  return { number: first.number, url: first.html_url, merged: false, open: true }
}

export async function pullState(token: string, owner: string, repo: string, number: number, fetchImpl?: Fetch): Promise<GithubPull | null> {
  const res = await (fetchImpl || fetch)(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, { headers: headers(token) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub ${res.status} pull ${number}`)
  const row = await res.json() as { number: number, html_url: string, merged_at?: string | null, state?: string }
  return {
    number: row.number,
    url: row.html_url,
    merged: Boolean(row.merged_at),
    open: row.state === 'open',
  }
}

export async function deleteBranch(token: string, owner: string, repo: string, branch: string, fetchImpl?: Fetch) {
  if (branch === 'main' || branch === 'staging') return
  const res = await (fetchImpl || fetch)(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch.split('/').map((part) => encodeURIComponent(part)).join('/')}`,
    { method: 'DELETE', headers: headers(token) },
  )
  if (res.status === 204 || res.status === 404 || res.status === 422) return
  if (!res.ok) throw new Error(`GitHub ${res.status} delete ${branch}`)
}

export async function ensureStandingPull(token: string, owner: string, repo: string, base: PrBase, fetchImpl?: Fetch) {
  if (base !== 'staging') return
  const existing = await findOpenPull(token, owner, repo, 'staging', 'main', fetchImpl)
  if (existing) return existing
  return openPull({
    token,
    owner,
    repo,
    title: 'staging',
    head: 'staging',
    base: 'main',
    body: 'Standing branch.',
  }, fetchImpl)
}
