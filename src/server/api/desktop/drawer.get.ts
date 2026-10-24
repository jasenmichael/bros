import { readCliPackages } from '../../utils/cli/packages'
import { assignPins, libraryApps, libraryProcessId } from '../../utils/desktopEntries'
import { readDesktopCatalog } from '../../utils/desktopEntryIo'
import { readPins } from '../../utils/desktopPins'
import { discoverSidecars } from '../../utils/sidecars/sidecars'

export default defineEventHandler(async () => {
  const { entries, openCounts } = await readDesktopCatalog()
  const library = assignPins(libraryApps(entries, readCliPackages(), discoverSidecars().sidecars), readPins()).map((app) => ({
    ...app,
    windows: openCounts[libraryProcessId(app)] || 0,
  }))
  return { entries, library }
})
