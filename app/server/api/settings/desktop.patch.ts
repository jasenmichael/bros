import { applyDesktopWallpaper, writeDesktopSettings } from '../../utils/desktopSettings'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ color?: string, imageUrl?: string }>(event)
  const saved = writeDesktopSettings({
    color: body?.color,
    imageUrl: body?.imageUrl,
  })
  await applyDesktopWallpaper(saved)
  return saved
})
