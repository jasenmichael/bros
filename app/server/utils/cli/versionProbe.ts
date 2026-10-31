export type ProbeApp = { id: string; kind: string; spec: string; bin?: string; clis?: string[]; version?: string }

function versionBin(pkg: ProbeApp): string {
  if (pkg.bin) return pkg.bin
  if (pkg.clis?.[0]) return pkg.clis[0]
  const raw = pkg.spec.includes('#') ? pkg.spec.split('#').pop() || pkg.spec : pkg.spec
  const name = raw.split('@')[0]?.split('/').pop() || ''
  return /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(name) ? name : ''
}

function sh(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

export function nodePin(env = process.env.BROS_NODE_VERSION): string {
  const raw = String(env || '26.7.0').trim().replace(/^v/, '')
  return /^\d+\.\d+/.test(raw) ? raw : '26.7.0'
}

export function nodeUpdateAvailable(installed: string | undefined, pin = nodePin()): boolean {
  if (!installed) return true
  return compareVersions(installed, pin) < 0
}

export function versionCommand(pkg: ProbeApp): string | null {
  const custom = pkg.version?.trim()
  if (custom && !custom.includes('\n')) return custom
  const bin = versionBin(pkg)
  if (!bin) return null
  const q = sh(bin)
  return `${q} --version 2>/dev/null || ${q} -V`
}

export function parseVersionText(_kind: string, _spec: string, text: string): string | null {
  const raw = text.trim()
  if (!raw) return null
  return raw.match(/v?(\d+\.\d+[0-9A-Za-z.+~-]*)/)?.[1] || null
}

/** Same PATH as the desktop terminal: Devbox from `~/.bashrc`, then `~/.cargo/env`. Login `bash -lc` skips `.bashrc`. */
export function versionShell(body: string): string {
  return [
    'eval "$(devbox global shellenv --init-hook 2>/dev/null)" || true',
    '. "$HOME/.cargo/env" 2>/dev/null || true',
    body,
  ].join('\n')
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

export function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.split(/[^0-9]+/).filter(Boolean).map((part) => Number(part) || 0)
  const left = parts(a)
  const right = parts(b)
  const n = Math.max(left.length, right.length)
  for (let i = 0; i < n; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff) return diff < 0 ? -1 : 1
  }
  return 0
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
