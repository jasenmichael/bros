import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')

/** Stale workspace-root paths after src/ → app/. Does not match cli/src or --from-src. */
const FORBIDDEN = [
  /pnpm --dir src\b/,
  /--dir src\b/,
  /working-directory:\s*src\b/,
  /cache-dependency-path:\s*src\//,
  /package_json_file:\s*src\//,
  /\/app\/src\b/,
  /\bsrc\/package\.json\b/,
  /\bsrc\/pnpm-lock\.yaml\b/,
  /\bsrc\/pnpm-workspace\.yaml\b/,
  /\bsrc\/ui\//,
  /\bsrc\/server\//,
  /\bsrc\/website\//,
  /\bsrc\/layers\//,
  /\bsrc\/node_modules\b/,
  /REPO_ROOT\/src\//,
  /\$ROOT\/src\//,
  /\$REPO_ROOT\/src\//,
  /join\(REPO,\s*['"]src\//,
  /from ['"]\.\.\/\.\.\/src\//,
]

const SCAN_DIRS = ['docs', 'skills', 'scripts', '.github', 'test', 'lib/desktop', 'cli/src']

const SCAN_FILES = [
  'AGENTS.md',
  'STACK.md',
  'PLAN.md',
  'README.md',
  'SPEC.md',
  'DESIGN.md',
  'GLOSSARY.md',
  '.dockerignore',
  '.gitignore',
]

const TEXT_EXT = new Set([
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml',
  '.sh',
  '.rs',
  '.toml',
  '.vue',
  '.css',
  '.txt',
])

function shouldScan(rel: string): boolean {
  if (rel.includes('node_modules') || rel.includes('.output') || rel.includes('.nuxt')) return false
  if (rel.endsWith('firecrawl/docker-compose.yml')) return false
  const base = rel.split('/').pop() || ''
  if (base === 'Dockerfile' || SCAN_FILES.includes(rel) || SCAN_FILES.includes(base)) return true
  const dot = base.lastIndexOf('.')
  if (dot < 0) return false
  return TEXT_EXT.has(base.slice(dot))
}

function walk(dir: string, out: string[]) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.output' || name === '.nuxt' || name === 'target') continue
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) walk(abs, out)
    else out.push(abs)
  }
}

describe('workspace root is app/', () => {
  it('keeps pnpm workspace and install scripts at the new paths', () => {
    expect(existsSync(join(root, 'app/package.json'))).toBe(true)
    expect(existsSync(join(root, 'src'))).toBe(false)
    expect(existsSync(join(root, 'scripts/install.sh'))).toBe(true)
    expect(existsSync(join(root, 'scripts/uninstall.sh'))).toBe(true)
    expect(existsSync(join(root, 'uninstall.sh'))).toBe(false)
    const websitePkg = JSON.parse(readFileSync(join(root, 'app/website/package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(websitePkg.scripts.predev).toContain('scripts/install.sh')
    expect(websitePkg.scripts.pregenerate).toContain('scripts/install.sh')
    expect(readFileSync(join(root, 'scripts/pack-release.sh'), 'utf8')).toContain(
      'scripts/uninstall.sh',
    )
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('pnpm --dir app')
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).not.toContain('pnpm --dir src')
  })

  it('has no stale src/ workspace paths in docs, scripts, CI, or tests', () => {
    const files: string[] = []
    for (const rel of SCAN_FILES) {
      const abs = join(root, rel)
      if (existsSync(abs)) files.push(abs)
    }
    for (const dir of SCAN_DIRS) walk(join(root, dir), files)

    const hits: string[] = []
    for (const abs of files) {
      const rel = relative(root, abs)
      if (rel === 'test/unit/workspace-root-app.test.ts') continue
      if (!shouldScan(rel)) continue
      let text: string
      try {
        text = readFileSync(abs, 'utf8')
      }
      catch {
        continue
      }
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        if (/\bsrcDir\s*:/.test(line)) continue
        for (const re of FORBIDDEN) {
          if (re.test(line)) {
            hits.push(`${rel}:${i + 1}: ${line.trim()}`)
            break
          }
        }
      }
    }
    expect(hits, hits.join('\n')).toEqual([])
  })
})
