import { readCliPackages } from '../../utils/cli/packages'
import { assignPins, libraryApps, libraryProcessId } from '../../utils/desktopEntries'
import { readDesktopCatalog } from '../../utils/desktopEntryIo'
import { readPins } from '../../utils/desktopPins'
import { discoverDockerApps } from '../../utils/docker-app/dockerApps'

export default defineEventHandler(async () => {
  const { entries, openCounts } = await readDesktopCatalog()
  const library = assignPins(libraryApps(entries, readCliPackages(), discoverDockerApps().dockerApps), readPins()).map((app) => ({
    ...app,
    windows: openCounts[libraryProcessId(app)] || 0,
  }))
  return { entries, library }
})
