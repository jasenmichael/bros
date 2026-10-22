import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { ofetch } from 'ofetch'
import { hostWorkspaceForCompose, loadBootstrapConfig } from '../server/utils/config.ts'
import {
  copyVendorModel,
  dataModelDir,
  GGUF_REL,
  readStamp,
  stampMatches,
  stampOf,
  STAMP_NAME,
  vendorModelDir,
  writeStampFile,
} from './model.ts'

export function commandEntry(command: string): 'stack' | 'oneoff' | 'exec' {
  if (command === '' || command === 'start') return 'stack'
  if (command === 'run' || command === 'shell') return 'exec'
  return 'oneoff'
}

export function startsStack(command: string): boolean {
  return command === '' || command === 'start' || command === 'restart'
}

export function usageText(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/^\n/, '')
}

function repoDir(): string {
  return process.env.BROS_HOST_REPO || '/app'
}

function usagePath(): string {
  const candidates = [
    '/usr/local/lib/bros-cli.md',
    '/app/docs/cli.md',
    join(repoDir(), 'docs/cli.md'),
    join(fileURLToPath(new URL('.', import.meta.url)), '../../docs/cli.md'),
  ]
  for (const file of candidates) {
    if (existsSync(file)) return file
  }
  return join(repoDir(), 'docs/cli.md')
}

export function readUsage(): string {
  return usageText(readFileSync(usagePath(), 'utf8'))
}

function version(): string {
  for (const file of [join(repoDir(), 'VERSION'), '/app/VERSION']) {
    if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  }
  return '0.1.0'
}

function run(cmd: string, args: string[], capture = false): Promise<{ code: number, out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: repoDir(),
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    let out = ''
    if (capture) {
      child.stdout?.on('data', (buf: Buffer) => { out += buf.toString() })
      child.stderr?.on('data', (buf: Buffer) => { out += buf.toString() })
    }
    child.on('error', (err) => {
      consola.warn(err.message)
      resolve({ code: 1, out })
    })
    child.on('exit', (code) => resolve({ code: code ?? 1, out }))
  })
}

function composeArgs(extra: string[]): string[] {
  const dev = process.env.BROS_DEV === '1'
  const overlay = dev ? 'docker-compose.dev.yml' : 'docker-compose.prod.yml'
  return ['compose', '-f', 'docker-compose.yml', '-f', overlay, ...extra]
}

function quietDocker(args: string[]): string[] {
  if (process.env.BROS_VERBOSE === '1') return args
  let next = args
  const up = next.indexOf('up')
  if (up !== -1) next = [...next.slice(0, up + 1), '--no-log-prefix', ...next.slice(up + 1)]
  const compose = next.indexOf('compose')
  if (compose !== -1) next = [...next.slice(0, compose + 1), '--progress', 'quiet', ...next.slice(compose + 1)]
  return next
}

function hostHttp(port: string, path: string): string {
  return `http://host.docker.internal:${port}${path}`
}

async function ollamaReachable(): Promise<boolean> {
  const port = process.env.BROS_OLLAMA_PORT || '11435'
  try {
    await ofetch(hostHttp(port, '/api/version'), { timeout: 3000 })
    return true
  }
  catch {
    return false
  }
}

async function hasBrosModel(): Promise<boolean> {
  const port = process.env.BROS_OLLAMA_PORT || '11435'
  try {
    const body = await ofetch<{ models?: { name?: string }[] }>(hostHttp(port, '/api/tags'), { timeout: 5000 })
    return (body.models || []).some((model) => {
      const name = model.name || ''
      return name === 'bros' || name.startsWith('bros:')
    })
  }
  catch {
    return false
  }
}

async function rmMatching(name: string) {
  const listed = await run('docker', ['ps', '-aq', '--filter', `name=${name}`], true)
  const ids = listed.out.split('\n').map(line => line.trim()).filter(Boolean)
  if (ids.length === 0) return
  const verbose = process.env.BROS_VERBOSE === '1'
  await run('docker', ['stop', '-t', '10', ...ids], !verbose)
  await run('docker', ['rm', '-f', ...ids], !verbose)
}

async function stopSidecars() {
  console.log('Stopping sidecars (bros-sc-*)…')
  await rmMatching('bros-sc-')
  await rmMatching('bros-desktop')
}

async function composeDown() {
  console.log('Stopping Bros core…')
  await rmMatching('bros')
}

async function ensureNetwork() {
  const net = process.env.BROS_NETWORK || 'bros'
  const seen = await run('docker', ['network', 'inspect', net], true)
  if (seen.code === 0) return
  await run('docker', ['network', 'create', '--driver', 'bridge', net])
}

async function waitForOllama() {
  for (let i = 0; i < 60; i++) {
    if (await ollamaReachable()) return true
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  consola.warn(`Ollama sidecar not reachable at ${hostHttp(process.env.BROS_OLLAMA_PORT || '11435', '/api/version')}`)
  return false
}

async function installModel() {
  const vendor = vendorModelDir()
  const dest = dataModelDir()
  const gguf = join(vendor, GGUF_REL)
  if (!existsSync(gguf)) {
    consola.warn(`internal bros model: missing packaged model: ${gguf}`)
    return
  }
  copyVendorModel(vendor, dest)
  const file = join(repoDir(), 'lib/sidecars/core/ollama/docker-compose.yml')
  console.log('Creating Ollama model bros…')
  const child = spawn('docker', [
    'compose', '-p', 'bros-sc-ollama', '-f', file, 'exec', '-T', 'ollama',
    'bash', '/bros-model/scripts/install-ollama.sh',
  ], { cwd: repoDir(), stdio: 'inherit', signal: AbortSignal.timeout(180_000) })
  const code = await new Promise<number>((resolve) => {
    child.on('error', () => resolve(1))
    child.on('exit', (exit) => resolve(exit ?? 1))
  })
  if (code !== 0) {
    consola.warn('internal bros model create failed')
    return
  }
  writeStampFile(dest, stampOf(gguf))
}

async function ensureOllamaAndModel() {
  const repo = repoDir()
  if (!existsSync(join(repo, 'vendor/bros-model/.git')) && existsSync(join(repo, '.git'))) {
    await run('git', ['-C', repo, 'submodule', 'update', '--init', '--depth', '1', 'vendor/bros-model'])
  }
  await ensureNetwork()
  const file = join(repo, 'lib/sidecars/core/ollama/docker-compose.yml')
  if (!existsSync(file)) {
    consola.warn(`missing ${file}`)
    return
  }
  console.log('Starting Ollama sidecar (bros-sc-ollama)…')
  const up = await run('docker', quietDocker(['compose', '-p', 'bros-sc-ollama', '-f', file, 'up', '-d', '--remove-orphans']))
  if (up.code !== 0) return
  if (!await waitForOllama()) return
  const gguf = join(vendorModelDir(), GGUF_REL)
  if (!existsSync(gguf)) {
    consola.warn(`internal bros model: missing packaged model: ${gguf}`)
    return
  }
  const saved = readStamp(join(dataModelDir(), STAMP_NAME))
  if (stampMatches(stampOf(gguf), saved) && await hasBrosModel()) {
    console.log('Internal model bros is current.')
    return
  }
  await installModel()
}

async function runStart() {
  try {
    await ensureOllamaAndModel()
  }
  catch (err) {
    consola.warn(err instanceof Error ? err.message : String(err))
  }
}

async function runStop() {
  await stopSidecars()
  await composeDown()
  console.log('Bros exited.')
}

function ensureHostWorkspace() {
  const workspace = hostWorkspaceForCompose()
  if (!workspace.trim()) throw new Error('BROS_HOST_WORKSPACE is unset')
  process.env.BROS_HOST_WORKSPACE = workspace
}

async function containerRunning(name: string): Promise<boolean> {
  const inspect = await run('docker', ['inspect', '-f', '{{.State.Running}}', name], true)
  return inspect.code === 0 && inspect.out.trim() === 'true'
}

async function runUpdate() {
  const repo = repoDir()
  consola.info('Bros update: rebuild images…')
  const built = await run('docker', composeArgs(['build', '--pull']))
  const cliDir = join(repo, 'lib/sidecars/core/desktop')
  ensureHostWorkspace()
  const { prepareDesktopAppBuild, writeDesktopAppStamp } = await import('../server/utils/cli/packages.ts')
  const { waitForDesktopSession } = await import('../server/utils/desktopReady.ts')
  const prep = prepareDesktopAppBuild()
  const apps = await run('docker', ['compose', '-p', 'bros-sc-desktop', '-f', join(cliDir, 'docker-compose.yml'), 'build'])
  if (apps.code === 0) writeDesktopAppStamp(prep.hash)
  let desk = 0
  if (apps.code === 0 && await containerRunning('bros-desktop')) {
    const files = ['-f', join(cliDir, 'docker-compose.yml')]
    const override = join(loadBootstrapConfig().dataDir, 'config', 'apps-compose.yml')
    if (existsSync(override)) files.push('-f', override)
    const up = await run('docker', ['compose', '-p', 'bros-sc-desktop', ...files, 'up', '-d'])
    desk = up.code
    if (up.code === 0) {
      const gaps = await waitForDesktopSession()
      if (gaps) consola.warn(`Desktop session is not ready: ${gaps}`)
    }
  }
  let app = 0
  if (await containerRunning('bros')) {
    const swapped = await run('docker', composeArgs(['up', '-d', '--no-deps', 'bros']))
    app = swapped.code
  }
  if (await ollamaReachable()) await ensureOllamaAndModel()
  if (built.code || apps.code || desk || app) {
    consola.error('Image rebuild failed. Running containers were left as they were.')
  } else {
    consola.info('Images rebuilt. A running Bros app and a running Desktop were replaced. Stopped ones were left stopped. Other sidecars were not updated.')
  }
  if (built.code !== 0) process.exitCode = built.code
  if (apps.code !== 0) process.exitCode = apps.code
  if (desk !== 0) process.exitCode = desk
  if (app !== 0) process.exitCode = app
}

async function gitDirty(): Promise<boolean> {
  const status = await run('git', [
    '-C', repoDir(), 'status', '--porcelain', '--',
    'docker-compose.yml', 'docker-compose.dev.yml', 'docker-compose.prod.yml', 'Dockerfile',
  ], true)
  if (status.out.trim()) {
    consola.info('Local uncommitted compose/Dockerfile changes:')
    consola.log(status.out.trim())
    return true
  }
  consola.info('Compose / Dockerfile clean.')
  return false
}

async function modelStale(): Promise<boolean> {
  const gguf = join(vendorModelDir(), GGUF_REL)
  if (!existsSync(gguf)) {
    consola.info('Packaged GGUF missing (vendor/bros-model). Skipped.')
    return false
  }
  const saved = readStamp(join(dataModelDir(), STAMP_NAME))
  const current = stampMatches(stampOf(gguf), saved)
  if (!current) {
    consola.info('Stamp stale — run update (or start) to reinstall.')
    return true
  }
  if (await ollamaReachable() && !await hasBrosModel()) {
    consola.info('Model bros missing — run update (or start) to reinstall.')
    return true
  }
  consola.info('Vendor GGUF stamp matches dest.')
  return false
}

async function runCheck() {
  let found = false
  const behind = await run('git', ['-C', repoDir(), 'rev-list', '--count', 'HEAD..@{u}'], true)
  if (behind.code === 0 && behind.out.trim() !== '0') {
    consola.info(`Git is ${behind.out.trim()} commit(s) behind upstream.`)
    found = true
  }
  else {
    consola.info('Git looks current (or no upstream).')
  }
  const pull = await run('docker', composeArgs(['pull', '--dry-run']), true)
  if (/pulled|would pull|downloading|download/i.test(pull.out)) {
    consola.info('Image updates available (compose pull --dry-run).')
    found = true
  }
  else {
    consola.info('Images look current (compose pull --dry-run).')
  }
  if (await gitDirty()) found = true
  if (await modelStale()) found = true
  if (!found) {
    consola.success('No actionable updates detected.')
    return
  }
  if (!process.stdin.isTTY) {
    consola.info('Updates available. Non-interactive stdin — not prompting. Run: bros update')
    return
  }
  const ans = await consola.prompt('Updates available. Run update now?', { type: 'confirm', initial: false })
  if (ans) await runUpdate()
  else consola.info('Skipped. Run: bros update')
}

async function runStatus() {
  await run('docker', composeArgs(['ps']))
  const port = process.env.BROS_PORT || '3055'
  try {
    await ofetch(hostHttp(port, '/api/health'), { timeout: 3000 })
    consola.success(`Health: ok (${hostHttp(port, '/api/health')})`)
  }
  catch {
    consola.warn(`Health: unreachable (${hostHttp(port, '/api/health')})`)
  }
  if (!await ollamaReachable()) {
    consola.info('Ollama sidecar: down')
    return
  }
  consola.info(await hasBrosModel()
    ? 'Ollama sidecar: up (model bros installed)'
    : 'Ollama sidecar: up (model bros missing)')
}

function serviceBin(): string {
  const bin = process.env.BROS_BIN || ''
  if (bin && existsSync(bin)) return bin
  const home = process.env.BROS_HOME || ''
  if (home && existsSync(join(home, 'bros'))) return join(home, 'bros')
  return join(repoDir(), 'bros')
}

function unitText(): string {
  const home = process.env.BROS_HOME || repoDir()
  const data = process.env.BROS_HOST_DATA_DIR || join(home, 'data')
  const config = process.env.BROS_CONFIG_HOST || join(home, 'bros.yml')
  const bin = serviceBin()
  return `[Unit]
Description=Bros local AI control plane
After=docker.socket
Wants=docker.socket

[Service]
Type=oneshot
RemainAfterExit=yes
Environment=BROS_HOME=${home}
Environment=BROS_DIR=${home}
Environment=BROS_HOST_DATA_DIR=${data}
Environment=BROS_CONFIG=${config}
ExecStart=${bin} -D
ExecStop=${bin} stop

[Install]
WantedBy=default.target
`
}

async function runService(action: string | undefined) {
  if (process.platform !== 'linux') {
    consola.error('service is Linux systemd --user only')
    process.exitCode = 1
    return
  }
  const dir = '/host-home/.config/systemd/user'
  const unit = join(dir, 'bros.service')
  if (action === 'install') {
    mkdirSync(dir, { recursive: true })
    writeFileSync(unit, unitText())
    await run('systemctl', ['--user', 'daemon-reload'])
    const enabled = await run('systemctl', ['--user', 'enable', '--now', 'bros.service'])
    consola.success(`Installed ${unit}`)
    consola.info('Without loginctl enable-linger, this unit stops on logout.')
    if (enabled.code !== 0) process.exitCode = enabled.code
    return
  }
  if (action === 'uninstall') {
    await run('systemctl', ['--user', 'disable', '--now', 'bros.service'])
    rmSync(unit, { force: true })
    await run('systemctl', ['--user', 'daemon-reload'])
    consola.success('Removed systemd --user unit bros.service')
    return
  }
  if (action === 'status') {
    const status = await run('systemctl', ['--user', 'status', 'bros.service', '--no-pager'])
    if (status.code !== 0) process.exitCode = status.code
    return
  }
  consola.error(`unknown service action: ${action || ''} (install|uninstall|status)`)
  process.exitCode = 1
}

async function appsUp(): Promise<boolean> {
  const seen = await run('docker', ['inspect', '-f', '{{.State.Running}}', 'bros-desktop'], true)
  return seen.out.trim() === 'true'
}

function cliComposeFile(): string {
  return join(repoDir(), 'lib/sidecars/core/desktop/docker-compose.yml')
}

async function execApps(command: string[]) {
  if (!await appsUp()) {
    consola.error('bros-desktop is not running. Start Bros first: bros')
    process.exitCode = 1
    return
  }
  ensureHostWorkspace()
  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  const args = ['compose', '-p', 'bros-sc-desktop', '-f', cliComposeFile(), 'exec']
  if (!tty) args.push('-T')
  args.push('desktop', ...command)
  const result = await run('docker', args)
  process.exitCode = result.code
}

async function runInApps(args: string[]) {
  if (args.length === 0) {
    consola.error('usage: bros run <command> [args...]  (example: bros run agent)')
    process.exitCode = 1
    return
  }
  await execApps(args)
}

async function runShell() {
  await execApps(['bash'])
}

function argvAfter(name: string): string[] {
  const argv = process.argv.slice(2)
  const index = argv.indexOf(name)
  return index === -1 ? [] : argv.slice(index + 1)
}

const flags = {
  daemon: { type: 'boolean' as const, alias: 'D' },
  interactive: { type: 'boolean' as const, alias: 'i' },
  config: { type: 'string' as const, alias: 'c' },
}

export const main = defineCommand({
  meta: { name: 'bros', description: 'Bros' },
  args: flags,
  subCommands: {
    start: defineCommand({
      meta: { name: 'start', description: 'Ollama sidecar and internal model' },
      args: flags,
      setup() { return runStart() },
    }),
    stop: defineCommand({
      meta: { name: 'stop', description: 'Stop sidecars, then core' },
      setup() { return runStop() },
    }),
    restart: defineCommand({
      meta: { name: 'restart', description: 'Stop, then the same full start' },
      args: flags,
      async setup() {
        await runStop()
        const up = process.env.BROS_DEV === '1' ? ['up'] : ['up', '--build']
        if (process.env.BROS_DAEMON === '1') up.push('-d')
        await ensureNetwork()
        await run('docker', quietDocker(composeArgs(up)))
        await runStart()
      },
    }),
    status: defineCommand({
      meta: { name: 'status', description: 'Compose ps and health' },
      setup() { return runStatus() },
    }),
    check: defineCommand({
      meta: { name: 'check', description: 'Look for updates' },
      setup() { return runCheck() },
    }),
    update: defineCommand({
      meta: { name: 'update', description: 'Git pull, submodule, images, rebuild' },
      setup() { return runUpdate() },
    }),
    upgrade: defineCommand({
      meta: { name: 'upgrade', description: 'Alias of update' },
      setup() { return runUpdate() },
    }),
    service: defineCommand({
      meta: { name: 'service', description: 'systemd --user unit' },
      setup() { return runService(argvAfter('service')[0]) },
    }),
    run: defineCommand({
      meta: { name: 'run', description: 'Exec in bros-desktop when it is up' },
      setup() { return runInApps(argvAfter('run')) },
    }),
    shell: defineCommand({
      meta: { name: 'shell', description: 'Host Bros terminal (bros-desktop bash)' },
      setup() { return runShell() },
    }),
    app: defineCommand({
      meta: { name: 'app', description: 'Check or update one app' },
      async setup() {
        const args = argvAfter('app')
        const id = args[1]
        if ((args[0] !== 'update' && args[0] !== 'check') || !id) {
          consola.error('usage: bros app update <id> | bros app check <id>')
          process.exitCode = 1
          return
        }
        const { updateApp, checkAppUpdate } = await import('../server/utils/cli/packages.ts')
        if (args[0] === 'check') {
          const row = await checkAppUpdate(id)
          if (row.run) {
            consola.info('A run command has no version check')
            return
          }
          if (row.version) consola.info(row.version)
          consola.info(row.available ? 'Update available' : 'Up to date')
          return
        }
        const row = await updateApp(id)
        if (row.code !== 0) {
          consola.error(row.stderr || 'Update failed')
          process.exitCode = row.code
        }
      },
    }),
  },
})

const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
if (isMain) {
  if (process.argv.includes('--dev')) {
    process.env.BROS_DEV = '1'
    process.argv = process.argv.filter((arg) => arg !== '--dev')
  }
  const argv = process.argv.slice(2)
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(readUsage())
    if (!readUsage().endsWith('\n')) process.stdout.write('\n')
    process.exit(0)
  }
  if (argv.includes('-v') || argv.includes('--version')) {
    console.log(`bros ${version()}`)
    process.exit(0)
  }
  const head = argv.find((arg) => !arg.startsWith('-'))
  if (head === 'run') {
    await runInApps(argvAfter('run'))
    process.exit(process.exitCode ?? 0)
  }
  if (head === 'shell') {
    await runShell()
    process.exit(process.exitCode ?? 0)
  }
  if (head === 'service') {
    await runService(argvAfter('service')[0])
    process.exit(process.exitCode ?? 0)
  }
  runMain(main)
}
