import { loadBootstrapConfig } from '../../utils/config'
import { hasPasscode } from '../../utils/auth'

export default defineEventHandler(() => {
  const cfg = loadBootstrapConfig()
  return {
    workingDir: cfg.workingDir,
    dataDir: cfg.dataDir,
    hasPasscode: hasPasscode(),
  }
})
