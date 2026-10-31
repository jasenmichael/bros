import type { PackageManager } from './types'

const UV_SPEC = /^[A-Za-z0-9][A-Za-z0-9._-]*(==[A-Za-z0-9][A-Za-z0-9._+-]*)?$/

export function uvName(spec: string): string {
  const eq = spec.indexOf('==')
  return eq === -1 ? spec : spec.slice(0, eq)
}

export const uv: PackageManager = {
  kind: 'uv',
  args: false,
  specLabel: 'Package',
  placeholder: 'ruff',
  parse(spec, args) {
    if (args) return 'args are only for npm'
    return UV_SPEC.test(spec) ? null : 'uv spec must be a package name'
  },
  label: uvName,
}
