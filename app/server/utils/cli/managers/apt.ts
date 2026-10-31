import type { PackageManager } from './types'

const APT_SPEC = /^[a-z0-9][a-z0-9.+-]{0,62}$/

export const apt: PackageManager = {
  kind: 'apt',
  args: false,
  specLabel: 'Package',
  placeholder: 'ripgrep',
  parse(spec, args) {
    if (args) return 'args are only for npm'
    return APT_SPEC.test(spec) ? null : 'apt spec must be a Debian package name'
  },
  label(spec) {
    const at = spec.indexOf('@')
    return at === -1 ? spec : spec.slice(0, at)
  },
}
