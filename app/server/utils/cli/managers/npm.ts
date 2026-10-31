import { flagError, npmSpecError, packageLabel, type PackageManager } from './types'
import { npmSuggest } from './search'

export const npm: PackageManager = {
  kind: 'npm',
  args: true,
  specLabel: 'Package',
  placeholder: 'typescript',
  parse(spec, args) {
    return npmSpecError(spec) || flagError(args)
  },
  label: packageLabel,
  suggest: npmSuggest,
}
