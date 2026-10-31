import type { PackageManager } from './types'

const RUN_SPEC = /^(curl|wget)\s+\S[\s\S]{0,400}$/

export const run: PackageManager = {
  kind: 'run',
  args: false,
  specLabel: 'Command',
  placeholder: 'curl -fsSL https://example.com/install | sh',
  parse(spec, args) {
    if (args) return 'args are only for npm'
    if (spec.includes('\n') || !RUN_SPEC.test(spec)) return 'run spec must be one curl or wget command'
    return null
  },
  label() {
    return ''
  },
}
