import type { PackageManager } from './types'
import { nixSuggest } from './search'

const NIX_NAME = /^[A-Za-z0-9@._+-]+$/

export function nixAttr(spec: string): string {
  const hash = spec.indexOf('#')
  return hash >= 0 ? spec.slice(hash + 1) : spec
}

export const nix: PackageManager = {
  kind: 'nix',
  args: false,
  specLabel: 'Package',
  placeholder: 'ripgrep',
  parse(spec, args) {
    if (args) return 'args are only for npm'
    const hash = spec.indexOf('#')
    if (hash >= 0 && spec.slice(0, hash) !== 'nixpkgs') return 'nix spec must be a package name'
    return NIX_NAME.test(nixAttr(spec)) ? null : 'nix spec must be a package name'
  },
  label: nixAttr,
  suggest: nixSuggest,
}
