import { describe, expect, it } from 'vitest'
import { assignPins, execBasename, guiLaunch, iconNameOk, libraryApps, libraryProcessId, parseDesktopDump, parseDesktopEntry, pinKey, stripFieldCodes } from '../../src/server/utils/desktopEntries'
import { pinProcessId } from '../../src/ui/utils/gui'

const cursor = `
[Desktop Entry]
Name=Cursor
Exec=/usr/share/cursor/cursor %F
Icon=co.anysphere.cursor
Type=Application

[Desktop Action new-empty-window]
Exec=/usr/share/cursor/cursor --new-window %F
`

const handler = `
[Desktop Entry]
Name=Cursor - URL Handler
Exec=/usr/share/cursor/cursor --open-url %U
Icon=co.anysphere.cursor
Type=Application
NoDisplay=true
`

describe('desktop entries', () => {
  it('matches Cursor by command and keeps the configured launch', () => {
    const entry = parseDesktopEntry(cursor, 'cursor')
    expect(entry?.command).toBe('cursor')
    expect(entry?.icon).toBe('co.anysphere.cursor')
    expect(execBasename(entry?.exec || '')).toBe('cursor')
    expect(guiLaunch('cursor', '--no-sandbox', entry?.exec)).toEqual(['cursor', '--no-sandbox'])
    expect(stripFieldCodes(entry?.exec || '')).toBe('/usr/share/cursor/cursor')
    expect(parseDesktopEntry(handler, 'cursor-url-handler')).toBeNull()
  })

  it('strips field codes and drops hidden entries from a dump', () => {
    const dump = `\n---ENTRY /usr/share/applications/cursor.desktop\n${cursor}\n---ENTRY /usr/share/applications/cursor-url-handler.desktop\n${handler}\n---OPEN\nterminal\n`
    const { entries, openIds, openCounts } = parseDesktopDump(dump)
    expect(entries.map((row) => row.id)).toEqual(['cursor'])
    expect(openIds).toEqual(['terminal'])
    expect(openCounts).toEqual({ terminal: 1 })
    const counted = parseDesktopDump(`${dump}app-cursor-cursor 2\n`)
    expect(counted.openIds).toEqual(['terminal', 'app-cursor-cursor'])
    expect(counted.openCounts).toEqual({ terminal: 1, 'app-cursor-cursor': 2 })
    expect(guiLaunch('', '', 'drawing %F')).toEqual(['drawing'])
    expect(iconNameOk('co.anysphere.cursor')).toBe(true)
    expect(iconNameOk('../etc/passwd')).toBe(false)
    expect(pinProcessId('python3.14')).toBe('pin-python3-14')
  })

  it('merges a desktop entry into the package gui and keeps foot as Terminal', () => {
    const cursorEntry = parseDesktopEntry(cursor, 'cursor')
    const foot = parseDesktopEntry('[Desktop Entry]\nName=Foot\nExec=foot\nIcon=utilities-terminal\nType=Application\n', 'foot')
    const firefox = parseDesktopEntry('[Desktop Entry]\nName=Firefox\nExec=firefox %u\nIcon=firefox\nType=Application\n', 'firefox')
    const apps = libraryApps(
      [cursorEntry!, foot!, firefox!],
      [
        { id: 'cursor', name: 'Cursor', enabled: true, interfaces: [{ type: 'gui', command: 'cursor' }] },
        { id: 'off', name: 'Off', enabled: false, interfaces: [{ type: 'gui', command: 'off' }] },
      ],
      [{ id: 'side', name: 'Side', disabled: true, interfaces: [{ type: 'gui', command: 'side' }] }],
    )
    expect(apps.map((app) => `${app.kind}:${app.id}`)).toEqual(['terminal:terminal', 'package:cursor', 'entry:firefox'])
    const pkg = apps.find((app) => app.kind === 'package')
    expect(pkg?.icon).toBe('co.anysphere.cursor')
    expect(pinKey(pkg!)).toBe('pkg-cursor-cursor')
    expect(libraryProcessId(pkg!)).toBe('app-cursor-cursor')
    expect(apps.find((app) => app.kind === 'terminal')?.icon).toBe('utilities-terminal')
    const hidden = libraryApps([cursorEntry!], [{ id: 'cursor', name: 'Cursor', enabled: false, interfaces: [{ type: 'gui', command: 'cursor' }] }], [])
    expect(hidden.map((app) => app.kind)).toEqual(['terminal'])
    const pinned = assignPins(apps, [{ id: 'cursor', kind: 'entry', command: 'cursor', exec: '/usr/share/cursor/cursor' }])
    expect(pinned.find((app) => app.kind === 'package')?.pinId).toBe('cursor')
  })
})
