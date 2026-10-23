export type ProbeApp = { id: string; kind: string; spec: string; bin?: string }

function sh(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

export function versionCommand(pkg: ProbeApp): string | null {
  if (pkg.id === 'paperclip') return 'HOME=/home/bros paperclipai --version'
  if (pkg.kind === 'run' || pkg.kind === 'deno' || pkg.kind === 'nix') return null
  const spec = pkg.spec.trim()
  if (pkg.kind === 'npm' && (spec === 'npm' || spec.startsWith('npm@') || pkg.bin === 'npm')) return 'npm --version'
  if (pkg.kind === 'pnpm' && (spec === 'pnpm' || spec.startsWith('pnpm@') || pkg.bin === 'pnpm')) return 'pnpm --version'
  if (pkg.kind === 'bun' && (spec === 'bun' || spec.startsWith('bun@') || pkg.bin === 'bun')) return 'bun --version'
  if (pkg.kind === 'npm') return `npm ls -g --depth=0 --prefix /usr/local ${sh(spec)}`
  if (pkg.kind === 'pnpm') return `pnpm list -g --depth 0 ${sh(spec)}`
  if (pkg.kind === 'bun') return 'bun pm ls -g'
  if (pkg.kind === 'apt') return `dpkg-query -W -f='\${Version}' ${sh(spec)}`
  if (pkg.kind === 'deb') return `name=$(head -n 1 /var/lib/bros/deb/${sh(pkg.id)}); [ -n "$name" ] && dpkg-query -W -f='\${Version}' "$name"`
  if (pkg.kind === 'uv') return spec === 'uv' || spec.startsWith('uv==') || pkg.bin === 'uv' ? 'uv --version' : 'uv tool list'
  if (pkg.kind === 'cargo') return spec === 'cargo' || pkg.bin === 'cargo' ? 'cargo --version' : 'cargo install --list'
  return null
}

export function parseVersionText(kind: string, spec: string, text: string): string | null {
  const raw = text.trim()
  if (!raw) return null
  if (spec === 'paperclipai') return raw.match(/\b(\d+\.\d+\.\d+)\b/)?.[1] || null
  if (kind === 'apt' || kind === 'deb') {
    const line = raw.split('\n').map((row) => row.trim()).find(Boolean) || ''
    return /^[0-9A-Za-z][0-9A-Za-z.+:~_-]{0,80}$/.test(line) ? line : null
  }
  if (kind === 'uv') {
    if (spec === 'uv' || spec.startsWith('uv==')) return raw.match(/\b(\d+\.\d+\.\d+)\b/)?.[1] || null
    const name = spec.split('==')[0]
    const line = raw.split('\n').find((row) => row.startsWith(`${name} `))
    return line?.split(/\s+/)[1]?.replace(/^v/, '') || null
  }
  if (kind === 'cargo') {
    if (spec === 'cargo' || spec.startsWith('cargo@')) return raw.match(/\bcargo\s+(\d+\.\d+\.\d+)/)?.[1] || null
    const name = spec.split('@')[0]
    const line = raw.split('\n').find((row) => row.startsWith(`${name} `))
    return line?.match(/v?(\d+\.\d+[^\s:]*)/)?.[1] || null
  }
  if (/^\d+\.\d+/.test(raw) && !raw.includes('\n')) return raw.split(/\s+/)[0] || null
  const name = spec.split('@')[0]?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || ''
  if (!name) return null
  const match = raw.match(new RegExp(`(?:^|[\\s/])${name}@([^\\s]+)`))
  return match?.[1] || null
}

export function buildVersionScript(packages: ProbeApp[]): string {
  const lines: string[] = []
  for (const pkg of packages) {
    const cmd = versionCommand(pkg)
    if (!cmd) continue
    lines.push(`echo '@@${pkg.id}'`)
    lines.push(`(${cmd}) 2>/dev/null || true`)
    lines.push('echo')
  }
  return lines.join('\n')
}

export function parseVersionScriptOutput(text: string, packages: ProbeApp[]): { id: string; version: string }[] {
  const byId = new Map(packages.map((pkg) => [pkg.id, pkg]))
  const out: { id: string; version: string }[] = []
  for (const part of text.split(/^@@/m).slice(1)) {
    const nl = part.indexOf('\n')
    const id = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1)
    const pkg = byId.get(id)
    if (!pkg) continue
    const version = parseVersionText(pkg.kind, pkg.spec, body)
    if (version) out.push({ id, version })
  }
  return out
}

export function parseOutdated(text: string, spec: string): { current?: string; latest?: string } {
  const name = spec.split('@')[0]
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (!parts[0] || (parts[0] !== name && !parts[0].endsWith(`/${name}`))) continue
    if (parts.length >= 4 && /^\d/.test(parts[1] || '') && /^\d/.test(parts[3] || '')) {
      return { current: parts[1], latest: parts[3] }
    }
  }
  return {}
}
