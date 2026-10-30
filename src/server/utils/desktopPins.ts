import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'pathe'
import { parse, stringify } from 'yaml'
import { pinProcessId } from '../../ui/utils/gui'
import { readCliPackages, closeAppGui, startAppGui } from './cli/packages'
import { loadBootstrapConfig } from './config'
import { execArgv, libraryApps, libraryProcessId, pinKey, type LibraryApp, type LibraryKind } from './desktopEntries'
import { readDesktopCatalog } from './desktopEntryIo'
import { closeGuiWindow, dockerCommandError, ensureAppsRunning, ensureDockerAppGui, execInBros } from './docker'
import { discoverDockerApps } from './docker-app/dockerApps'

export type DesktopPin = {
  id: string
  name: string
  icon: string
  kind: LibraryKind
  exec: string
  appId: string
  command: string
}

const SCRIPT = '/app/lib/desktop/desktop-gui.sh'
const FOOT = ['foot', '--working-directory=/home/bros/workspace']
const KINDS = new Set<LibraryKind>(['terminal', 'package', 'docker', 'entry'])

function pinsFile() {
  return join(loadBootstrapConfig().dataDir, 'config', 'desktop-pins.yml')
}

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

export function readPins(): DesktopPin[] {
  const file = pinsFile()
  if (!existsSync(file)) return []
  try {
    const raw = parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(raw)) return []
    return raw.flatMap((row) => {
      if (!row || typeof row !== 'object') return []
      const pin = row as Partial<DesktopPin>
      if (!pin.id) return []
      const kind = (pin.kind || (pin.exec ? 'entry' : '')) as LibraryKind
      if (!KINDS.has(kind)) return []
      if (kind === 'entry' && !pin.exec) return []
      return [{
        id: String(pin.id),
        name: String(pin.name || pin.id),
        icon: String(pin.icon || ''),
        kind,
        exec: String(pin.exec || ''),
        appId: String(pin.appId || ''),
        command: String(pin.command || ''),
      }]
    })
  } catch {
    return []
  }
}

function writePins(pins: DesktopPin[]) {
  const file = pinsFile()
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, stringify(pins))
}

async function loadLibrary() {
  const { entries } = await readDesktopCatalog()
  return libraryApps(entries, readCliPackages(), discoverDockerApps().dockerApps)
}

export async function addPin(input: { kind?: string, id?: string, command?: string }) {
  const id = input.id || ''
  if (!id) fail(400, 'id required')
  const apps = await loadLibrary()
  const app = apps.find((row) => {
    if (input.kind && row.kind !== input.kind) return false
    if (row.id !== id) return false
    if (input.command && row.command !== input.command) return false
    return true
  })
  if (!app) fail(404, 'Desktop entry not found')
  const pins = readPins()
  const key = pinKey(app)
  if (pins.some((pin) => pin.id === key)) fail(409, 'Launcher already on the Drawer')
  const pin: DesktopPin = {
    id: key,
    name: app.name,
    icon: app.icon,
    kind: app.kind,
    exec: app.kind === 'entry' ? app.exec : '',
    appId: app.kind === 'package' || app.kind === 'core' ? app.id : '',
    command: app.command,
  }
  pins.push(pin)
  writePins(pins)
  return pin
}

export function removePin(id: string) {
  const pins = readPins()
  const next = pins.filter((pin) => pin.id !== id)
  if (next.length === pins.length) fail(404, 'Pinned launcher not found')
  writePins(next)
}

async function gui(action: 'start' | 'close' | 'stop', proc: string, argv: string[] = []) {
  await ensureAppsRunning()
  const args = action === 'start'
    ? [SCRIPT, 'start', proc, '--', ...argv]
    : [SCRIPT, action, proc]
  const res = await execInBros(args)
  if (res.code !== 0) {
    const message = action === 'start' ? 'Desktop app failed to start' : 'Desktop app failed to stop'
    throw createError(dockerCommandError(500, message, res.stderr || res.stdout || message))
  }
}

export async function openLibraryApp(app: LibraryApp) {
  if (app.kind === 'terminal') return gui('start', 'terminal', FOOT)
  if (app.kind === 'package') return startAppGui(app.id, app.command)
  if (app.kind === 'core') return ensureDockerAppGui(app.id)
  return gui('start', pinProcessId(app.id), execArgv(app.exec))
}

export async function closeLibraryApp(app: LibraryApp) {
  if (app.kind === 'terminal') return gui('close', 'terminal')
  if (app.kind === 'package') return closeAppGui(app.id, app.command)
  if (app.kind === 'core') return closeGuiWindow(app.id)
  return gui('close', pinProcessId(app.id))
}

export async function focusLibraryApp(input: { kind?: string, id?: string, command?: string }) {
  const id = input.id || ''
  if (!id) fail(400, 'id required')
  const app = (await loadLibrary()).find((row) => {
    if (input.kind && row.kind !== input.kind) return false
    if (row.id !== id) return false
    if (input.command && row.command !== input.command) return false
    return true
  })
  if (!app) fail(404, 'Desktop entry not found')
  await ensureAppsRunning()
  const res = await execInBros([SCRIPT, 'focus', libraryProcessId(app)])
  if (res.code === 3) return openLibraryApp(app)
  if (res.code !== 0) {
    throw createError(dockerCommandError(500, 'Desktop window failed to focus', res.stderr || res.stdout || 'Desktop window failed to focus'))
  }
}

function appFromPin(pin: DesktopPin): LibraryApp {
  return {
    kind: pin.kind,
    id: pin.kind === 'package' || pin.kind === 'core' ? pin.appId : pin.kind === 'terminal' ? 'terminal' : pin.id,
    name: pin.name,
    command: pin.command,
    icon: pin.icon,
    exec: pin.exec,
  }
}

function mustPin(id: string) {
  const pin = readPins().find((row) => row.id === id)
  if (!pin) fail(404, 'Pinned launcher not found')
  return pin
}

export async function startPin(id: string) {
  return openLibraryApp(appFromPin(mustPin(id)))
}

export async function closePin(id: string) {
  return closeLibraryApp(appFromPin(mustPin(id)))
}

export async function openDesktopEntry(id: string) {
  const app = (await loadLibrary()).find((row) => row.kind === 'entry' && row.id === id)
  if (!app) fail(404, 'Desktop entry not found')
  return openLibraryApp(app)
}

export async function closeDesktopEntry(id: string) {
  const app = (await loadLibrary()).find((row) => row.kind === 'entry' && row.id === id)
  if (!app) fail(404, 'Desktop entry not found')
  return closeLibraryApp(app)
}

export function startTerminal() {
  return gui('start', 'terminal', FOOT)
}

export function closeTerminal() {
  return gui('close', 'terminal')
}

export function stopTerminal() {
  return gui('stop', 'terminal')
}
