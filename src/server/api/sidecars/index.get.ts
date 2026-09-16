import { discoverSidecars } from '../../utils/sidecars'
import { getProjectStatus, getSidecarSetting } from '../../utils/docker'

export default defineEventHandler(async () => {
  const { sidecars, errors } = discoverSidecars()
  const items = await Promise.all(sidecars.map(async (s) => {
    const settings = getSidecarSetting(s.id)
    const status = s.error ? { project: `bros-sc-${s.id}`, running: false, services: [] } : await getProjectStatus(s)
    return {
      ...s,
      settings,
      status,
    }
  }))
  return { sidecars: items, errors }
})
