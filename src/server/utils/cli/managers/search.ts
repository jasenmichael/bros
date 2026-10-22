const NPM_SEARCH = 'https://registry.npmjs.org/-/v1/search'
const NIX_SITE = 'https://search.nixos.org'

type NixSearchConfig = { user: string; pass: string; version: string }

let nixConfig: (NixSearchConfig & { at: number }) | null = null

export function npmSuggestionNames(payload: unknown): string[] {
  const objects = payload && typeof payload === 'object' && 'objects' in payload
    ? (payload as { objects?: unknown }).objects
    : null
  if (!Array.isArray(objects)) return []
  const names: string[] = []
  for (const row of objects) {
    const name = row && typeof row === 'object' && 'package' in row
      ? (row as { package?: { name?: unknown } }).package?.name
      : null
    if (typeof name === 'string' && name) names.push(name)
  }
  return names.slice(0, 8)
}

export function nixSuggestionNames(payload: unknown): string[] {
  const hits = payload && typeof payload === 'object' && 'hits' in payload
    ? (payload as { hits?: { hits?: unknown } }).hits?.hits
    : null
  if (!Array.isArray(hits)) return []
  const names: string[] = []
  for (const hit of hits) {
    const name = hit && typeof hit === 'object' && '_source' in hit
      ? (hit as { _source?: { package_attr_name?: unknown } })._source?.package_attr_name
      : null
    if (typeof name === 'string' && name) names.push(name)
  }
  return names.slice(0, 8)
}

export function nixSearchScriptPath(html: string): string | null {
  return html.match(/\/static\/js\/index\.[a-z0-9]+\.js/)?.[0] ?? null
}

export function readNixSearchConfig(js: string): NixSearchConfig | null {
  const user = js.match(/elasticsearchUsername:"([^"]+)"/)?.[1]
  const pass = js.match(/elasticsearchPassword:"([^"]+)"/)?.[1]
  const version = js.match(/elasticsearchMappingSchemaVersion:parseInt\("(\d+)"\)/)?.[1]
  if (!user || !pass || !version) return null
  return { user, pass, version }
}

export function nixPrefix(query: string): string {
  const hash = query.indexOf('#')
  const raw = (hash >= 0 ? query.slice(hash + 1) : query).toLowerCase()
  return raw.replace(/[^a-z0-9@._+-]/g, '').slice(0, 64)
}

async function loadNixSearchConfig(): Promise<NixSearchConfig> {
  if (nixConfig && Date.now() - nixConfig.at < 60 * 60 * 1000) return nixConfig
  const html = await fetch(NIX_SITE, { signal: AbortSignal.timeout(8000) }).then((res) => res.text())
  const path = nixSearchScriptPath(html)
  if (!path) throw new Error('nix search script missing')
  const js = await fetch(`${NIX_SITE}${path}`, { signal: AbortSignal.timeout(8000) }).then((res) => res.text())
  const config = readNixSearchConfig(js)
  if (!config) throw new Error('nix search config missing')
  nixConfig = { ...config, at: Date.now() }
  return config
}

export async function npmSuggest(query: string): Promise<string[]> {
  const url = `${NPM_SEARCH}?text=${encodeURIComponent(query.slice(0, 64))}&size=8`
  const payload = await fetch(url, { signal: AbortSignal.timeout(8000) }).then((res) => res.json())
  return npmSuggestionNames(payload)
}

export async function nixSuggest(query: string): Promise<string[]> {
  const prefix = nixPrefix(query)
  if (prefix.length < 2) return []
  const config = await loadNixSearchConfig()
  const payload = await fetch(`${NIX_SITE}/backend/latest-${config.version}-nixos-unstable/_search`, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Basic ${Buffer.from(`${config.user}:${config.pass}`).toString('base64')}`,
    },
    body: JSON.stringify({
      size: 8,
      _source: ['package_attr_name'],
      sort: ['package_attr_name'],
      query: { prefix: { package_attr_name: prefix } },
    }),
  }).then((res) => res.json())
  return nixSuggestionNames(payload)
}
