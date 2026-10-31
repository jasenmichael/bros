import { beforeEach, describe, expect, it, vi } from 'vitest'

const execInBros = vi.fn()
const execInDockerApp = vi.fn()

vi.mock('../../app/server/utils/docker', () => ({
  execInBros: (...args: unknown[]) => execInBros(...args),
  execInDockerApp: (...args: unknown[]) => execInDockerApp(...args),
}))

describe('desktopEntryIo', () => {
  beforeEach(() => {
    execInBros.mockReset()
    execInDockerApp.mockReset()
  })

  it('reads catalog and icons via execInBros, not desktop dockerApp', async () => {
    execInBros.mockResolvedValueOnce({
      code: 0,
      stdout: '\n---ENTRY /usr/share/applications/cursor.desktop\n[Desktop Entry]\nName=Cursor\nExec=/usr/share/cursor/cursor\nIcon=co.anysphere.cursor\nType=Application\n\n---OPEN\n',
      stderr: '',
    })
    const { readDesktopCatalog } = await import('../../app/server/utils/desktopEntryIo')
    const catalog = await readDesktopCatalog()
    expect(execInBros).toHaveBeenCalled()
    expect(execInDockerApp).not.toHaveBeenCalled()
    expect(catalog.entries.some((row) => row.command === 'cursor')).toBe(true)

    execInBros.mockResolvedValueOnce({
      code: 0,
      stdout: '/usr/share/pixmaps/co.anysphere.cursor.png\n' + Buffer.from('png').toString('base64'),
      stderr: '',
    })
    const { readDesktopIcon } = await import('../../app/server/utils/desktopEntryIo')
    const icon = await readDesktopIcon('co.anysphere.cursor')
    expect(execInDockerApp).not.toHaveBeenCalled()
    expect(icon?.mime).toBe('image/png')
    expect(icon?.body.equals(Buffer.from('png'))).toBe(true)
  })

  it('prefers icon.png beside the app config over a desktop icon scan', async () => {
    const { readDesktopIcon } = await import('../../app/server/utils/desktopEntryIo')
    const icon = await readDesktopIcon('cursor')
    expect(execInBros).not.toHaveBeenCalled()
    expect(icon?.mime).toBe('image/png')
    expect([...(icon?.body.subarray(0, 4) || [])]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('uses icon.png beside the app config when Desktop has no icon file', async () => {
    execInBros.mockResolvedValueOnce({ code: 1, stdout: '', stderr: '' })
    const { readDesktopIcon } = await import('../../app/server/utils/desktopEntryIo')
    const icon = await readDesktopIcon('ghostty')
    expect(icon?.mime).toBe('image/png')
    expect([...(icon?.body.subarray(0, 4) || [])]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })
})
