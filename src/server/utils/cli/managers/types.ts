export type PackageManager = {
  kind: string
  args: boolean
  specLabel: string
  placeholder: string
  parse(spec: string, args: string): string | null
  label(spec: string): string
  suggest?: (query: string) => Promise<string[]>
}

export type ManagerForm = {
  kind: string
  args: boolean
  suggest: boolean
  specLabel: string
  placeholder: string
}

const NPM_SPEC = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(@[a-z0-9][a-z0-9._+-]*)?$/i
const ARG_SPEC = /^--?[A-Za-z0-9][A-Za-z0-9._:=+-]*$/

export function npmSpecError(spec: string): string | null {
  return NPM_SPEC.test(spec) ? null : 'npm spec must be a package name'
}

export function flagError(args: string): string | null {
  if (!args) return null
  if (args.includes('\n') || args.split(/\s+/).some((part) => !ARG_SPEC.test(part))) return 'args must be flags'
  return null
}

export function packageLabel(spec: string): string {
  if (spec.startsWith('@')) {
    const slash = spec.indexOf('/')
    const rest = spec.slice(slash + 1)
    const at = rest.indexOf('@')
    return at === -1 ? spec : spec.slice(0, slash + 1 + at)
  }
  const at = spec.indexOf('@')
  return at === -1 ? spec : spec.slice(0, at)
}
