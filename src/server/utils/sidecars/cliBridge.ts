import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isShellBin } from '../../../ui/shared/shellBins'
import { projectName, type SidecarInterface, type SidecarMeta } from './sidecars'

export const CLI_BRIDGE_MARK = '# bros-cli-bridge'

export { isShellBin }

export type CliSource = 'host' | 'sidecar' | 'none'

export type CliBinStatus = {
  bin: string
  hostInstalled: boolean
  source: CliSource
}

type CliLink = {
  bin: string
  command: string
  service: string
}

type CliPack = {
  id: string
  dir: string
  interfaces: SidecarInterface[]
}

export function brosCliSource(input: {
  hostBin: boolean
  sidecarRunning: boolean
}): CliSource {
  if (input.sidecarRunning) return 'sidecar'
  if (input.hostBin) return 'host'
  return 'none'
}

export function cliLinks(sidecar: { id: string; interfaces: SidecarInterface[] }): CliLink[] {
  const out: CliLink[] = []
  for (const iface of sidecar.interfaces) {
    if (iface.type !== 'cli') continue
    const command = (iface.command || iface.bin || '').trim()
    const bin = (iface.bin || iface.command || '').trim()
    if (!bin || !command || isShellBin(bin)) continue
    out.push({ bin, command, service: iface.service || sidecar.id })
  }
  return out
}

export function isBridgeScript(path: string): boolean {
  try {
    const st = lstatSync(path)
    if (!st.isFile() || st.isSymbolicLink()) return false
    return readFileSync(path, 'utf8').includes(CLI_BRIDGE_MARK)
  } catch {
    return false
  }
}

/** Symlinks count. Our wrapper file does not. */
export function hostCliInstalled(bin: string, hostBinDir: string | null): boolean {
  if (!hostBinDir) return false
  const path = join(hostBinDir, bin)
  try {
    const st = lstatSync(path)
    if (st.isSymbolicLink()) return true
    if (!st.isFile()) return false
    return !isBridgeScript(path)
  } catch {
    return false
  }
}

export function cliHostDirs(): { hostBinDir: string | null; execBinDir: string | null } {
  const mounted = existsSync('/host-home') ? '/host-home' : ''
  const home = mounted || process.env.HOME || ''
  const bind = process.env.BROS_HOST_HOME_BIND?.trim() || ''
  const hostBinDir = home ? join(home, '.local/bin') : null
  const execBinDir = bind ? join(bind, '.local/bin') : hostBinDir
  return { hostBinDir, execBinDir }
}

export function describeCli(
  sidecar: { id: string; interfaces: SidecarInterface[] },
  sidecarRunning: boolean,
  hostBinDir: string | null = cliHostDirs().hostBinDir,
): CliBinStatus[] {
  return cliLinks(sidecar).map((link) => {
    const hostInstalled = hostCliInstalled(link.bin, hostBinDir)
    return {
      bin: link.bin,
      hostInstalled,
      source: brosCliSource({ hostBin: hostInstalled, sidecarRunning }),
    }
  })
}

function sh(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function hostScript(execPath: string): string {
  return `#!/bin/sh\n${CLI_BRIDGE_MARK}\nexec ${sh(execPath)} "$@"\n`
}

function sidecarScript(pack: CliPack, link: CliLink): string {
  const file = join(pack.dir, 'docker-compose.yml')
  const project = projectName(pack.id)
  const base = ['docker', 'compose', '-p', project, '-f', file, 'exec']
  const tty = [...base, '-it', link.service, link.command].map(sh).join(' ')
  const pipe = [...base, '-T', link.service, link.command].map(sh).join(' ')
  // ICRNL turns Enter into LF before a raw TUI sees it. Those menus only accept CR.
  return [
    '#!/bin/sh',
    CLI_BRIDGE_MARK,
    'if [ -t 0 ]; then',
    '  saved=$(stty -g 2>/dev/null || true)',
    '  if [ -n "$saved" ]; then',
    '    trap \'stty "$saved"\' EXIT INT TERM',
    '    stty -icanon -echo -icrnl -inlcr min 1 time 0 || true',
    '  fi',
    `  ${tty} "$@"`,
    '  exit $?',
    'else',
    `  exec ${pipe} "$@"`,
    'fi',
    '',
  ].join('\n')
}

function hostExecPath(bin: string, hostBinDir: string, execBinDir: string): string {
  if (hostCliInstalled(bin, execBinDir)) return join(execBinDir, bin)
  return join(hostBinDir, bin)
}

function applyDir(dir: string, want: Map<string, string>) {
  if (want.size === 0 && !existsSync(dir)) return
  mkdirSync(dir, { recursive: true })
  for (const [name, body] of want) {
    const path = join(dir, name)
    if (existsSync(path) && !isBridgeScript(path)) continue
    writeFileSync(path, body, { mode: 0o755 })
    chmodSync(path, 0o755)
  }
  for (const name of readdirSync(dir)) {
    if (want.has(name)) continue
    const path = join(dir, name)
    if (isBridgeScript(path)) unlinkSync(path)
  }
}

export function syncCliBridges(input: {
  sidecars: CliPack[]
  running: Set<string>
  brosBinDir: string
  hostBinDir: string | null
  execBinDir: string | null
}) {
  const wantBros = new Map<string, string>()
  for (const pack of input.sidecars) {
    const running = input.running.has(pack.id)
    for (const link of cliLinks(pack)) {
      const hostBin = hostCliInstalled(link.bin, input.hostBinDir)
      const source = brosCliSource({ hostBin, sidecarRunning: running })
      if (source === 'host' && input.hostBinDir) {
        const execDir = input.execBinDir || input.hostBinDir
        wantBros.set(link.bin, hostScript(hostExecPath(link.bin, input.hostBinDir, execDir)))
      }
      else if (source === 'sidecar') {
        wantBros.set(link.bin, sidecarScript(pack, link))
      }
    }
  }
  applyDir(input.brosBinDir, wantBros)
  if (input.hostBinDir) applyDir(input.hostBinDir, new Map())
}

export function cliPacks(sidecars: SidecarMeta[]): CliPack[] {
  return sidecars.map((s) => ({ id: s.id, dir: s.dir, interfaces: s.interfaces }))
}
