import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadBootstrapConfig } from './config'

export type SkillPack = {
  id: string
  name: string
  description: string
  body: string
  source: 'bros' | 'internal' | 'cursor' | 'claude' | 'agents' | 'opencode'
  readOnly: boolean
}

const AUTO_ROOTS: Array<{ dir: string; source: SkillPack['source'] }> = [
  { dir: '.cursor/skills', source: 'cursor' },
  { dir: '.claude/skills', source: 'claude' },
  { dir: '.agents/skills', source: 'agents' },
  { dir: '.opencode/skills', source: 'opencode' },
]

function appRoot(): string {
  return loadBootstrapConfig().workingDir
}

export function skillsDataDir(): string {
  return join(loadBootstrapConfig().dataDir, 'skills')
}

export function skillsInternalDir(): string {
  return join(loadBootstrapConfig().dataDir, 'skills-internal')
}

function shippedSkillsDir(): string {
  return join(appRoot(), 'lib/skills')
}

function shippedInternalDir(): string {
  return join(shippedSkillsDir(), 'internal')
}

function ruleFilePath(): string {
  return join(loadBootstrapConfig().dataDir, 'rules', 'assistant.md')
}

function copyMissing(from: string, to: string) {
  if (!existsSync(from) || existsSync(to)) return
  mkdirSync(resolve(to, '..'), { recursive: true })
  cpSync(from, to, { recursive: true })
}

export function ensureSkillFiles() {
  const dataSkills = skillsDataDir()
  const shipped = shippedSkillsDir()
  if (existsSync(shipped)) {
    for (const name of readdirSync(shipped)) {
      if (name === 'internal') continue
      const src = join(shipped, name)
      if (!statSync(src).isDirectory()) continue
      copyMissing(src, join(dataSkills, name))
    }
  }
  if (existsSync(shippedInternalDir())) {
    for (const name of readdirSync(shippedInternalDir())) {
      const src = join(shippedInternalDir(), name)
      if (!statSync(src).isDirectory()) continue
      copyMissing(src, join(skillsInternalDir(), name))
    }
  }
  const rule = ruleFilePath()
  const shippedRule = join(appRoot(), 'lib/rules/assistant.md')
  copyMissing(shippedRule, rule)
}

function parseSkillFile(id: string, file: string, source: SkillPack['source'], readOnly: boolean): SkillPack | null {
  if (!existsSync(file)) return null
  const raw = readFileSync(file, 'utf8')
  let name = id
  let description = ''
  let body = raw
  if (raw.startsWith('---\n')) {
    const end = raw.indexOf('\n---\n', 4)
    if (end !== -1) {
      const front = raw.slice(4, end)
      body = raw.slice(end + 5).trim()
      for (const line of front.split('\n')) {
        const idx = line.indexOf(':')
        if (idx === -1) continue
        const key = line.slice(0, idx).trim()
        const value = line.slice(idx + 1).trim()
        if (key === 'name' && value) name = value
        if (key === 'description') description = value
      }
    }
  }
  return { id, name, description, body, source, readOnly }
}

function packsIn(dir: string, source: SkillPack['source'], readOnly: boolean, prefix: string): SkillPack[] {
  if (!existsSync(dir)) return []
  const out: SkillPack[] = []
  for (const name of readdirSync(dir)) {
    const skill = join(dir, name, 'SKILL.md')
    const id = prefix ? `${prefix}:${name}` : name
    const pack = parseSkillFile(id, skill, source, readOnly)
    if (pack) out.push(pack)
  }
  return out
}

export function listUserSkills(): SkillPack[] {
  ensureSkillFiles()
  return packsIn(skillsDataDir(), 'bros', false, '')
}

export function listCatalogSkills(): SkillPack[] {
  const own = listUserSkills()
  const seen = new Set(own.map((s) => s.id))
  const extra: SkillPack[] = []
  const homes = [process.env.BROS_HOST_HOME, loadBootstrapConfig().workingDir].filter((v): v is string => Boolean(v))
  for (const home of homes) {
    for (const root of AUTO_ROOTS) {
      for (const pack of packsIn(join(home, root.dir), root.source, true, root.source)) {
        if (seen.has(pack.id)) continue
        seen.add(pack.id)
        extra.push(pack)
      }
    }
  }
  return [...own, ...extra]
}

export function readSkill(id: string): SkillPack | null {
  const catalog = listCatalogSkills()
  return catalog.find((s) => s.id === id) ?? null
}

export function readInternalSkill(name: 'label' | 'task'): string {
  ensureSkillFiles()
  const file = join(skillsInternalDir(), name, 'SKILL.md')
  const pack = parseSkillFile(name, file, 'internal', true)
  return pack?.body || ''
}

/** Mode skill. Not listed, not pinnable, not in the load_skill catalog. */
export function readTaskSkill(task: string): string {
  ensureSkillFiles()
  const file = join(skillsInternalDir(), 'tasks', `${task}.md`)
  if (!existsSync(file)) return ''
  return readFileSync(file, 'utf8').trim()
}

export function withTaskSkill<T extends { role: string; content: string }>(messages: T[], task: string): T[] {
  const text = readTaskSkill(task)
  if (!text) return messages
  const copy = messages.map((m) => ({ ...m }))
  const first = copy.findIndex((m) => m.role === 'system')
  if (first >= 0) {
    const existing = copy[first]!.content.trim()
    copy[first] = { ...copy[first]!, content: existing ? `${existing}\n\n${text}` : text }
    return copy
  }
  return [{ role: 'system', content: text } as T, ...copy]
}

export function writeUserSkill(id: string, markdown: string) {
  if (!/^[a-z0-9-]+$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'skill id must be letters, numbers, and dashes' })
  }
  const dir = join(skillsDataDir(), id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), markdown.endsWith('\n') ? markdown : `${markdown}\n`)
}

/** Keep the skill name and description. Replace only the body. */
export function writeUserSkillBody(id: string, body: string) {
  const existing = readSkill(id)
  const name = existing?.source === 'bros' ? existing.name : id
  const description = existing?.source === 'bros' ? existing.description : ''
  const markdown = `---\nname: ${name}\ndescription: ${description}\n---\n\n${body.trim()}\n`
  writeUserSkill(id, markdown)
}

/** Rule file names skills. Chat loads those bodies. Label and task do not. */
export function personaSystemText(): string {
  ensureSkillFiles()
  const rulePath = ruleFilePath()
  const rule = existsSync(rulePath) ? readFileSync(rulePath, 'utf8') : 'Use skill personality.\nUse skill rules.\n'
  const ids = [...rule.matchAll(/Use skill ([a-z0-9-]+)/gi)].map((m) => m[1]!.toLowerCase())
  const parts: string[] = []
  for (const id of ids) {
    const pack = listUserSkills().find((s) => s.id === id)
    if (pack?.body.trim()) parts.push(pack.body.trim())
  }
  return parts.join('\n\n')
}

export function withPersona<T extends { role: string; content: string }>(messages: T[]): T[] {
  const text = personaSystemText()
  if (!text) return messages
  const copy = messages.map((m) => ({ ...m }))
  const first = copy.findIndex((m) => m.role === 'system')
  if (first >= 0) {
    const existing = copy[first]!.content.trim()
    copy[first] = { ...copy[first]!, content: existing ? `${text}\n\n${existing}` : text }
    return copy
  }
  return [{ role: 'system', content: text } as T, ...copy]
}
