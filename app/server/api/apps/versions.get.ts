import { probeAppVersions } from '../../utils/cli/packages'

export default defineEventHandler(async () => {
  try {
    return { versions: await probeAppVersions() }
  } catch {
    return { versions: [] }
  }
})
