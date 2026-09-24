import { readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { AgentTool, AgentTrace, ToolContext } from './agentLoop'
import { canonicalUrl, scrapeAllowed, type SearchHit } from './firecrawl'

const READ_CAP = 12_000
const LIST_CAP = 200
const GREP_CAP = 40
const GREP_FILES = 300
const SKIP_DIRS = new Set(['node_modules', '.git'])

function rememberHit(trace: AgentTrace, allowed: Set<string>, hit: SearchHit) {
  const key = canonicalUrl(hit.url)
  if (!key) return
  allowed.add(key)
  if (trace.sources.some((source) => canonicalUrl(source.url) === key)) return
  trace.sources.push({ title: hit.title, url: hit.url })
}

export function resolveToolPath(root: string, input: string): string | null {
  const base = resolve(root)
  const target = resolve(base, input || '.')
  const rel = relative(base, target)
  if (rel.startsWith('..') || isAbsolute(rel)) return null
  if (rel.split(sep).includes('..')) return null
  return target
}

async function listDir(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const raw = typeof args.path === 'string' ? args.path : '.'
  const dir = resolveToolPath(ctx.root, raw)
  if (!dir) return 'Refused: path escapes the working directory'
  ctx.onStatus?.({ phase: 'reading', detail: raw })
  const info = await stat(dir)
  if (!info.isDirectory()) return 'Not a directory'
  const rows = await readdir(dir, { withFileTypes: true })
  const lines = rows.slice(0, LIST_CAP).map((row) => (row.isDirectory() ? `${row.name}/` : row.name))
  const extra = rows.length > LIST_CAP ? `\n[${rows.length - LIST_CAP} more]` : ''
  return lines.join('\n') + extra || '(empty)'
}

async function readFileTool(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const raw = typeof args.path === 'string' ? args.path : ''
  if (!raw) return 'path required'
  const file = resolveToolPath(ctx.root, raw)
  if (!file) return 'Refused: path escapes the working directory'
  ctx.onStatus?.({ phase: 'reading', detail: raw })
  const info = await stat(file)
  if (!info.isFile()) return 'Not a file'
  const text = await readFile(file, 'utf8')
  if (text.length <= READ_CAP) return text
  return `${text.slice(0, READ_CAP)}\n\n[truncated]`
}

async function walkFiles(dir: string, root: string, out: string[], left: { n: number }) {
  if (left.n <= 0) return
  const rows = await readdir(dir, { withFileTypes: true })
  for (const row of rows) {
    if (left.n <= 0) return
    if (row.isDirectory()) {
      if (SKIP_DIRS.has(row.name)) continue
      await walkFiles(resolve(dir, row.name), root, out, left)
      continue
    }
    if (!row.isFile()) continue
    left.n -= 1
    out.push(resolve(dir, row.name))
  }
}

async function grepTool(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const pattern = typeof args.pattern === 'string' ? args.pattern : ''
  if (!pattern) return 'pattern required'
  const raw = typeof args.path === 'string' ? args.path : '.'
  const dir = resolveToolPath(ctx.root, raw)
  if (!dir) return 'Refused: path escapes the working directory'
  ctx.onStatus?.({ phase: 'reading', detail: raw })
  let regex: RegExp
  try {
    regex = new RegExp(pattern)
  } catch {
    return 'Invalid pattern'
  }
  const info = await stat(dir)
  const files: string[] = []
  if (info.isDirectory()) await walkFiles(dir, ctx.root, files, { n: GREP_FILES })
  else if (info.isFile()) files.push(dir)
  else return 'Not a file or directory'
  const hits: string[] = []
  for (const file of files) {
    if (hits.length >= GREP_CAP) break
    let text = ''
    try {
      text = await readFile(file, 'utf8')
    } catch {
      continue
    }
    if (text.includes('\0')) continue
    const lines = text.split('\n')
    const rel = relative(resolve(ctx.root), file) || file
    for (let i = 0; i < lines.length; i++) {
      if (hits.length >= GREP_CAP) break
      if (!regex.test(lines[i] || '')) continue
      hits.push(`${rel}:${i + 1}:${lines[i]}`)
    }
  }
  return hits.join('\n') || 'No matches.'
}

async function webSearch(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) return 'query required'
  ctx.onStatus?.({ phase: 'searching', detail: query })
  ctx.trace.queries.push(query)
  const hits = await ctx.search(query, ctx.signal)
  for (const hit of hits) rememberHit(ctx.trace, ctx.allowedUrls, hit)
  if (!hits.length) return 'No results.'
  return hits.map((hit) => `${hit.title}\n${hit.url}\n${hit.snippet}`.trim()).join('\n\n')
}

async function webFetch(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const url = typeof args.url === 'string' ? args.url.trim() : ''
  if (!url) return 'url required'
  const gate = scrapeAllowed(url, ctx.allowedUrls)
  if (!gate.ok) return `Refused: ${gate.reason}`
  ctx.onStatus?.({ phase: 'reading', detail: gate.url })
  const markdown = await ctx.scrape(gate.url, ctx.signal)
  rememberHit(ctx.trace, ctx.allowedUrls, { title: gate.url, url: gate.url, snippet: '' })
  return markdown || 'Empty page.'
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'list_dir',
    description: 'List one directory inside the working directory. Directories end with a slash.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative directory. Defaults to the working directory.' } },
    },
    execute: listDir,
  },
  {
    name: 'read_file',
    description: 'Read a text file inside the working directory.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative file path' } },
      required: ['path'],
    },
    execute: readFileTool,
  },
  {
    name: 'grep',
    description: 'Search text files under the working directory. Skips node_modules and .git.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'JavaScript regular expression' },
        path: { type: 'string', description: 'Relative file or directory. Defaults to the working directory.' },
      },
      required: ['pattern'],
    },
    execute: grepTool,
  },
  {
    name: 'web_search',
    description: 'Search the web. Use when the answer needs current pages. Returns titles, urls, and snippets.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query'],
    },
    execute: webSearch,
  },
  {
    name: 'web_fetch',
    description: 'Read one public http(s) page as markdown. The URL must be from web_search this turn, or typed by the user.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Public http(s) URL' } },
      required: ['url'],
    },
    execute: webFetch,
  },
]
