import { npmSpecError, packageLabel, type PackageManager } from './types'

export const pnpm: PackageManager = {
  kind: 'pnpm',
  args: false,
  specLabel: 'Package',
  placeholder: 'typescript',
  parse(spec, args) {
    if (args) return 'args are only for npm'
    return npmSpecError(spec)
  },
  label: packageLabel,
}
