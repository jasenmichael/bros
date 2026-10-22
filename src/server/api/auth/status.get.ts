import { hasPasscode, isSessionValid, SESSION_COOKIE } from '../../utils/auth'
import { loadBootstrapConfig } from '../../utils/config'

export default defineEventHandler((event) => {
  const token = getCookie(event, SESSION_COOKIE)
  const cfg = loadBootstrapConfig()
  return {
    hasPasscode: hasPasscode(),
    authenticated: isSessionValid(token),
    workingDir: cfg.workingDir,
    dataDir: cfg.dataDir,
  }
})
