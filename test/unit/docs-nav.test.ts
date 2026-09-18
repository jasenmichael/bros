import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { docsBreadcrumbs, docsNavHrefs } from '../../src/layers/docs/app/utils/docsNav'

const root = join(import.meta.dirname, '../..')
const docsRoot = join(root, 'docs')

function listDocsMarkdown(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(full).isDirectory()) {
      out.push(...listDocsMarkdown(full, rel))
      continue
    }
    if (name.endsWith('.md')) out.push(rel)
  }
  return out
}

function hrefForDoc(rel: string) {
  const slug = rel.replace(/\.md$/, '')
  return `/docs/${slug}`
}

describe('docs nav tree', () => {
  it('lists every docs markdown file', () => {
    const hrefs = new Set(docsNavHrefs())
    const files = listDocsMarkdown(docsRoot)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(hrefs.has(hrefForDoc(file)), file).toBe(true)
    }
  })

  it('builds crumbs for custom providers', () => {
    expect(docsBreadcrumbs('/docs/models-custom').map((crumb) => crumb.label)).toEqual([
      'Docs',
      'App',
      'Models',
      'Custom providers',
    ])
  })

  it('keeps folder labels without a page', () => {
    expect(docsBreadcrumbs('/docs/getting-started').map((crumb) => crumb.label)).toEqual([
      'Docs',
      'Start',
      'Getting started',
    ])
  })
})
