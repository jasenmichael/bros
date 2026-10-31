import type { PackageManager } from './types'

const DENO_SPEC = /^(npm:|jsr:)[A-Za-z0-9@/._+-]+$/

export const deno: PackageManager = {
  kind: 'deno',
  args: false,
  specLabel: 'Package',
  placeholder: 'npm:cowsay',
  parse(spec, args) {
    if (args) return 'args are only for npm'
    return DENO_SPEC.test(spec) ? null : 'deno spec must look like npm:name or jsr:name'
  },
  label(spec) {
    const bare = spec.slice(spec.indexOf(':') + 1)
    const slash = bare.lastIndexOf('/')
    const name = slash >= 0 ? bare.slice(slash + 1) : bare
    const at = name.indexOf('@')
    return at === -1 ? name : name.slice(0, at)
  },
}
