import { loadBootstrapConfig } from '../../utils/config'
import { ensureProxyKey, hasPasscode, proxyPublicOrigin } from '../../utils/auth'
import { dataRepairPlan } from '../../utils/repairData'
import { isHostOllamaEnabled, isWhisperEnabled } from '../../utils/settings'
import { listApiProxyPaths } from '../../utils/sidecars/sidecarProxy'

export default defineEventHandler(() => {
  const cfg = loadBootstrapConfig()
  const origin = proxyPublicOrigin(cfg.publicUrl)
  const proxyPaths = listApiProxyPaths()
  const repair = dataRepairPlan()
  return {
    appDir: cfg.workingDir,
    dataDir: cfg.dataDir,
    publicUrl: cfg.publicUrl,
    hasPasscode: hasPasscode(),
    enableHostOllama: isHostOllamaEnabled(),
    enableWhisper: isWhisperEnabled(),
    proxyKey: ensureProxyKey(),
    proxyPaths,
    proxyUrls: proxyPaths.map((path) => (origin ? `${origin}${path}` : path)),
    hostUid: repair.hostUid,
    hostGid: repair.hostGid,
    repairCommand: repair.command,
  }
})
