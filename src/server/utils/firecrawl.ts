import { sidecarReachUrl } from './hostProbe'

export const FIRECRAWL_PUBLISH = 3002
export const SEARCH_LIMIT = 5
export const SCRAPE_CHAR_CAP = 12_000
export const RETRIEVE_SCRAPE_COUNT = 3

export class FirecrawlDownError extends Error {
  constructor() {
    super('Firecrawl sidecar is stopped')
    this.name = 'FirecrawlDownError'
  }
}

export type SearchHit = {
  title: string
  url: string
  snippet: string
}

export function firecrawlBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return sidecarReachUrl({
    service: 'firecrawl',
    containerPort: 3002,
    publish: FIRECRAWL_PUBLISH,
    envPortKey: 'BROS_FIRECRAWL_PORT',
  }, env)
}

export function capMarkdown(text: string): string {
  if (text.length <= SCRAPE_CHAR_CAP) return text
  return `${text.slice(0, SCRAPE_CHAR_CAP)}\n\n[truncated]`
}

export function canonicalUrl(raw: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const path = parsed.pathname.replace(/\/$/, '') || '/'
  const port = parsed.port ? `:${parsed.port}` : ''
  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port}${path}${parsed.search}`
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0') return true
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/** Scrape only public http(s) URLs that this turn's search already returned. */
export function scrapeAllowed(url: string, allowed: ReadonlySet<string>): { ok: true; url: string } | { ok: false; reason: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'invalid url' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'only http(s)' }
  }
  if (isPrivateHost(parsed.hostname)) return { ok: false, reason: 'private host' }
  const key = canonicalUrl(url)
  if (!key || !allowed.has(key)) return { ok: false, reason: 'url was not in this turn’s search results' }
  return { ok: true, url: parsed.toString() }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function hitFromRow(row: Record<string, unknown>): SearchHit | null {
  const url = typeof row.url === 'string' ? row.url : (typeof row.link === 'string' ? row.link : '')
  const key = canonicalUrl(url)
  if (!key) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (isPrivateHost(parsed.hostname)) return null
  const title = typeof row.title === 'string' ? row.title : url
  const snippet = typeof row.description === 'string'
    ? row.description
    : (typeof row.snippet === 'string' ? row.snippet : '')
  return { title, url, snippet }
}

export function parseSearchHits(body: unknown): SearchHit[] {
  const root = asRecord(body)
  const data = root?.data
  let rows: unknown[] = []
  if (Array.isArray(data)) rows = data
  else {
    const dataRow = asRecord(data)
    if (Array.isArray(dataRow?.web)) rows = dataRow.web
    else if (Array.isArray(dataRow?.results)) rows = dataRow.results
  }
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const rec = asRecord(row)
    if (!rec) continue
    const hit = hitFromRow(rec)
    if (!hit) continue
    const key = canonicalUrl(hit.url)
    if (!key || seen.has(key)) continue
    seen.add(key)
    hits.push(hit)
  }
  return hits
}

export function parseScrapeMarkdown(body: unknown): string {
  const root = asRecord(body)
  const data = asRecord(root?.data) || root
  const markdown = typeof data?.markdown === 'string'
    ? data.markdown
    : (typeof data?.content === 'string' ? data.content : '')
  return capMarkdown(markdown)
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

async function postJson(path: string, payload: unknown, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  let res: Response
  try {
    res = await fetchImpl(`${firecrawlBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (err) {
    if (isAbort(err)) throw err
    throw new FirecrawlDownError()
  }
  if (!res.ok) {
    if (res.status === 502 || res.status === 503) throw new FirecrawlDownError()
    throw new Error(await res.text())
  }
  return res.json()
}

export async function firecrawlSearch(query: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<SearchHit[]> {
  const body = await postJson('/v2/search', { query, limit: SEARCH_LIMIT }, signal, fetchImpl)
  return parseSearchHits(body)
}

export async function firecrawlScrape(url: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<string> {
  const body = await postJson('/v2/scrape', { url, formats: ['markdown'], timeout: 60000 }, signal, fetchImpl)
  return parseScrapeMarkdown(body)
}
