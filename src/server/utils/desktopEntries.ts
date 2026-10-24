import { guiAppProxyId, pinProcessId } from '../../ui/utils/gui'

export type DesktopEntry = {
  id: string
  name: string
  exec: string
  icon: string
  command: string
}

export type LibraryKind = 'terminal' | 'package' | 'sidecar' | 'entry'

export type LibraryApp = {
  kind: LibraryKind
  id: string
  name: string
  command: string
  icon: string
  exec: string
}

export type PinRef = {
  id: string
  kind?: string
  command?: string
  exec?: string
}

const FIELD_CODE = /%(?:%|[fFuUdDnNickvm])/g

export function stripFieldCodes(exec: string) {
  return exec.replace(FIELD_CODE, (code) => code === '%%' ? '%' : '').replace(/\s+/g, ' ').trim()
}

export function execArgv(exec: string) {
  return stripFieldCodes(exec).split(' ').filter(Boolean)
}

export function execBasename(exec: string) {
  const token = execArgv(exec)[0] || ''
  const base = token.split('/').pop() || ''
  return base
}

/** A configured gui command wins. Exec is only the launch line when there is no command. */
export function guiLaunch(command: string, args = '', entryExec = '') {
  if (command) return [command, ...args.split(/\s+/).filter(Boolean)]
  return execArgv(entryExec)
}

export function iconNameOk(name: string) {
  if (!name || name.includes('..')) return false
  if (name.startsWith('/')) return /^\/usr\/share\/(?:pixmaps|icons)\/[A-Za-z0-9._+/-]+$/.test(name)
  return /^[A-Za-z0-9][A-Za-z0-9._+-]{0,180}$/.test(name)
}

function flag(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true'
}

/** The main Desktop Entry group, or null when it must not be listed. */
export function parseDesktopEntry(text: string, id: string): DesktopEntry | null {
  let section = ''
  const fields = new Map<string, string>()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[')) {
      if (section === 'Desktop Entry') break
      section = line.slice(1, -1).trim()
      continue
    }
    if (section !== 'Desktop Entry') continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq)
    if (!fields.has(key)) fields.set(key, line.slice(eq + 1).trim())
  }
  if (fields.get('Type') !== 'Application') return null
  if (flag(fields.get('NoDisplay')) || flag(fields.get('Hidden'))) return null
  const exec = fields.get('Exec') || ''
  if (!exec) return null
  const command = execBasename(exec)
  if (!command) return null
  return {
    id,
    name: fields.get('Name') || id,
    exec,
    icon: fields.get('Icon') || '',
    command,
  }
}

export function parseDesktopDump(text: string): { entries: DesktopEntry[], openIds: string[], openCounts: Record<string, number> } {
  const parts = text.split('\n---OPEN\n')
  const body = parts[0] || ''
  const openRaw = parts[1] || ''
  const openIds: string[] = []
  const openCounts: Record<string, number> = {}
  for (const line of openRaw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const bits = trimmed.split(/\s+/)
    const id = bits[0] || ''
    if (!id) continue
    const parsed = Number(bits[1])
    const count = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
    if (openCounts[id] == null) openIds.push(id)
    openCounts[id] = (openCounts[id] || 0) + count
  }
  const entries = new Map<string, DesktopEntry>()
  for (const chunk of body.split('\n---ENTRY ').slice(1)) {
    const nl = chunk.indexOf('\n')
    const path = (nl === -1 ? chunk : chunk.slice(0, nl)).trim()
    const file = nl === -1 ? '' : chunk.slice(nl + 1)
    const id = path.split('/').pop()?.replace(/\.desktop$/, '') || ''
    if (!id) continue
    const entry = parseDesktopEntry(file, id)
    if (entry) entries.set(id, entry)
  }
  return { entries: [...entries.values()], openIds, openCounts }
}

type GuiSource = {
  id: string
  name?: string
  enabled?: boolean
  disabled?: boolean
  bin?: string
  spec?: string
  interfaces?: Array<{ type: string, command?: string }>
}

function guiCommand(command: string) {
  return execBasename(command)
}

export function pinKey(app: { kind: LibraryKind, id: string, command?: string }) {
  if (app.kind === 'terminal') return 'terminal'
  if (app.kind === 'package') return `pkg-${app.id}-${guiCommand(app.command || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '') || 'gui'}`
  if (app.kind === 'sidecar') return `side-${app.id}`
  return app.id
}

export function libraryProcessId(app: { kind: LibraryKind, id: string, command?: string }) {
  if (app.kind === 'terminal') return 'terminal'
  if (app.kind === 'package') return guiAppProxyId(app.id, app.command || '')
  if (app.kind === 'sidecar') return app.id
  return pinProcessId(app.id)
}

/** One tile per launch. A configured gui command absorbs a desktop entry with the same basename. */
export function libraryApps(entries: DesktopEntry[], packages: GuiSource[], sidecars: GuiSource[]): LibraryApp[] {
  const byCommand = new Map<string, DesktopEntry>()
  for (const entry of entries) if (!byCommand.has(entry.command)) byCommand.set(entry.command, entry)
  const used = new Set<string>(['foot'])
  const out: LibraryApp[] = [{
    kind: 'terminal',
    id: 'terminal',
    name: 'Terminal',
    command: 'foot',
    icon: byCommand.get('foot')?.icon || '',
    exec: '',
  }]
  const pushGui = (kind: 'package' | 'sidecar', source: GuiSource) => {
    for (const iface of source.interfaces || []) {
      if (iface.type !== 'gui' || !iface.command) continue
      const base = guiCommand(iface.command)
      if (used.has(base)) continue
      used.add(base)
      const hidden = kind === 'package' ? source.enabled === false : source.disabled === true
      if (hidden) continue
      out.push({
        kind,
        id: source.id,
        name: source.name || source.bin || source.spec || source.id,
        command: iface.command,
        icon: byCommand.get(base)?.icon || '',
        exec: '',
      })
    }
  }
  for (const pkg of packages) pushGui('package', pkg)
  for (const side of sidecars) pushGui('sidecar', side)
  for (const entry of entries) {
    if (used.has(entry.command)) continue
    used.add(entry.command)
    out.push({
      kind: 'entry',
      id: entry.id,
      name: entry.name,
      command: entry.command,
      icon: entry.icon,
      exec: execArgv(entry.exec).join(' '),
    })
  }
  return out
}

/** Attach a stored pin to the one library tile it launches. */
export function assignPins(apps: LibraryApp[], pins: PinRef[]) {
  const used = new Set<string>()
  return apps.map((app) => {
    const key = pinKey(app)
    let pin = pins.find((row) => row.id === key && !used.has(row.id))
    if (!pin) {
      const base = guiCommand(app.command)
      pin = pins.find((row) => {
        if (used.has(row.id)) return false
        if ((row.kind || 'entry') !== 'entry') return false
        return row.id === app.id || guiCommand(row.exec || row.command || '') === base
      })
    }
    if (pin) used.add(pin.id)
    return { ...app, pinId: pin?.id || '' }
  })
}
