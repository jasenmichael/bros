import type { PackageManager } from './types'

const CARGO_SPEC = /^[A-Za-z0-9][A-Za-z0-9_-]*(@[A-Za-z0-9][A-Za-z0-9._+-]*)?$/

export function cargoName(spec: string): string {
  const at = spec.lastIndexOf('@')
  return at <= 0 ? spec : spec.slice(0, at)
}

export const cargo: PackageManager = {
  kind: 'cargo',
  args: false,
  specLabel: 'Package',
  placeholder: 'ripgrep',
  parse(spec, args) {
    if (args) return 'args are only for npm'
    return CARGO_SPEC.test(spec) ? null : 'cargo spec must be a package name'
  },
  label: cargoName,
}
