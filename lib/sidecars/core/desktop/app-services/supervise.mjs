import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = '/opt/bros/enabled-apps'
const runningPath = '/opt/bros/apps/running.json'

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

export function servicesFromYaml(text) {
  const cmds = []
  let inServices = false
  for (const line of text.split('\n')) {
    if (!inServices) {
      if (line.trim() === 'services:') inServices = true
      continue
    }
    if (line && !/^\s/.test(line) && !line.trim().startsWith('#')) break
    const script = line.match(/^\s+-\s+script:\s+(.+?)\s*$/)
    if (script) {
      const command = unquote(script[1])
      if (command && !command.startsWith('/') && !command.split('/').includes('..')) cmds.push({ command, script: command })
      continue
    }
    const match = line.match(/^\s+-\s+(?:command:\s+)?(.+?)\s*$/)
    if (!match) continue
    const command = unquote(match[1])
    if (command) cmds.push({ command })
  }
  return cmds
}

export function runningIds(text) {
  try {
    const doc = JSON.parse(text)
    const ids = Array.isArray(doc?.ids) ? doc.ids : []
    return ids.filter((id) => typeof id === 'string' && id)
  } catch {
    return []
  }
}

function idFromYaml(text) {
  return text.match(/^id:\s*['"]?([A-Za-z0-9][A-Za-z0-9._+-]*)['"]?\s*$/m)?.[1] || ''
}

export function commandsForRunning(files, ids) {
  const want = new Set(ids)
  const out = []
  for (const file of files) {
    if (/^enabled:\s*false\s*$/m.test(file.text)) continue
    const id = idFromYaml(file.text)
    if (!id || !want.has(id)) continue
    for (const service of servicesFromYaml(file.text)) {
      const command = service.script
        ? (service.script.includes('/') ? service.script : `./${service.script}`)
        : service.command
      out.push({ id, command, ...(service.script && file.dir ? { cwd: file.dir } : {}) })
    }
  }
  return out
}

function readRunning() {
  try {
    return runningIds(readFileSync(runningPath, 'utf8'))
  } catch {
    return []
  }
}

function readAppFiles() {
  let names = []
  try {
    names = readdirSync(dir).sort()
  } catch {
    return []
  }
  const files = []
  const seen = new Set()
  for (const name of names) {
    const appDir = join(dir, name)
    const config = join(appDir, 'config.yml')
    if (!existsSync(config)) continue
    seen.add(name)
    files.push({ text: readFileSync(config, 'utf8'), dir: appDir })
  }
  for (const name of names) {
    if (!name.endsWith('.yml')) continue
    const id = name.slice(0, -4)
    if (!id || seen.has(id)) continue
    files.push({ text: readFileSync(join(dir, name), 'utf8'), dir })
  }
  return files
}

const live = new Map()
const settled = new Set()

function keyOf(id, command) {
  return `${id}\0${command}`
}

function killChild(child) {
  if (!child || child.exitCode != null || child.killed) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

function drop(key, state) {
  state.stop = true
  killChild(state.child)
  if (live.get(key) === state) live.delete(key)
}

function launch(id, command, cwd) {
  const key = keyOf(id, command)
  if (live.has(key)) return
  const state = { stop: false, child: null }
  const child = spawn('runuser', ['-u', 'abc', '--', 'bash', '-lc', command], { stdio: 'inherit', detached: true, ...(cwd ? { cwd } : {}) })
  state.child = child
  live.set(key, state)
  child.on('exit', (code) => {
    if (state.stop || code === 0) {
      if (live.get(key) === state) live.delete(key)
      if (code === 0 && !state.stop) settled.add(key)
      return
    }
    state.child = null
    setTimeout(() => {
      if (state.stop || live.get(key) !== state) return
      live.delete(key)
      if (!readRunning().includes(id)) return
      launch(id, command, cwd)
    }, 3000)
  })
}

function reconcile() {
  const wanted = commandsForRunning(readAppFiles(), readRunning())
  const wantKeys = new Set(wanted.map((row) => keyOf(row.id, row.command)))
  for (const key of settled) {
    if (!wantKeys.has(key)) settled.delete(key)
  }
  for (const [key, state] of live) {
    if (!wantKeys.has(key)) drop(key, state)
  }
  for (const row of wanted) {
    if (!settled.has(keyOf(row.id, row.command))) launch(row.id, row.command, row.cwd)
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  // ponytail: 2s poll of running.json. Watch the file if start latency matters.
  reconcile()
  setInterval(reconcile, 2000)
}
