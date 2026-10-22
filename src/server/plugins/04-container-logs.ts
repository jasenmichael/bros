import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { loadBootstrapConfig } from '../utils/config'
import { containerLogFile, followContainerLog } from '../utils/containerLogs'
import { listBrosManagedContainers } from '../utils/docker'

const followed = new Map<string, ChildProcess>()

async function syncContainerLogs() {
  const dir = join(loadBootstrapConfig().dataDir, 'var', 'logs')
  const containers = await listBrosManagedContainers()
  for (const container of containers) {
    if (!container.running || followed.has(container.id)) continue
    const file = containerLogFile(dir, container.service, container.sidecarId)
    const child = followContainerLog(container.id, file)
    followed.set(container.id, child)
    child.on('close', () => {
      if (followed.get(container.id) === child) followed.delete(container.id)
    })
  }
}

/** Append each running Bros container's stdout/stderr to `data/var/logs`. */
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  const tick = () => {
    syncContainerLogs().catch((err) => console.error('[bros] container logs', err))
  }
  setTimeout(tick, 2_000).unref()
  setInterval(tick, 10_000).unref()
})
