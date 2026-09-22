import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('layer ownership', () => {
  it('gives website marketing `/` and the app the dashboard `/`', () => {
    expect(existsSync(join(root, 'src/website/app/pages/index.vue'))).toBe(true)
    expect(existsSync(join(root, 'src/layers/docs/app/pages/index.vue'))).toBe(false)
    expect(existsSync(join(root, 'src/app/pages/index.vue'))).toBe(true)
    expect(read('src/website/app/pages/index.vue')).toContain('Docs site (this site)')
    expect(read('src/app/pages/index.vue')).toContain('Dashboard')
  })

  it('keeps `/docs` only in the docs layer', () => {
    expect(existsSync(join(root, 'src/layers/docs/app/pages/docs/index.vue'))).toBe(true)
    expect(existsSync(join(root, 'src/layers/docs/app/pages/docs/[...slug].vue'))).toBe(true)
    expect(existsSync(join(root, 'src/app/pages/docs'))).toBe(false)
    expect(existsSync(join(root, 'src/website/app/pages/docs'))).toBe(false)
    expect(read('src/layers/docs/app/pages/docs/index.vue')).toContain('Documentation')
  })

  it('puts the shared shell in theme, not in either app', () => {
    expect(existsSync(join(root, 'src/layers/theme/app/app.vue'))).toBe(true)
    expect(existsSync(join(root, 'src/app/app.vue'))).toBe(false)
    expect(existsSync(join(root, 'src/layers/docs/app/app.vue'))).toBe(false)
    expect(read('src/layers/theme/app/app.vue')).toContain('NuxtLayout')
    expect(read('src/layers/theme/app/layouts/default.vue')).toContain('BrosAppNav')
    expect(read('src/app/app.config.ts')).toContain('Dashboard')
    expect(read('src/app/app.config.ts')).toContain("label: 'Providers'")
    expect(read('src/app/app.config.ts')).toContain("to: '/providers'")
    expect(read('src/app/app.config.ts')).not.toContain("label: 'Models'")
    expect(read('src/app/app.config.ts')).not.toContain("to: '/models'")
    expect(read('src/app/app.config.ts')).toContain('docsNavItems')
    expect(read('src/website/app/app.config.ts')).toContain('docsNavItems')
    expect(read('src/layers/docs/app/utils/docsNav.ts')).toContain('Getting started')
    expect(read('src/layers/docs/app/utils/docsNav.ts')).toContain("to: '/docs/providers'")
    expect(read('src/layers/docs/app/utils/docsNav.ts')).toContain("to: '/docs/providers/custom'")
    expect(read('src/layers/docs/app/utils/docsNav.ts')).toContain("to: '/docs/development'")
    expect(read('src/layers/theme/app/components/BrosAppNav.vue')).toContain('BrosNavTree')
    expect(read('src/layers/docs/app/pages/docs/[...slug].vue')).toContain('BrosDocsCrumbs')
  })

  it('hides recents scrollbar in theme dock chrome', () => {
    const nav = read('src/layers/theme/app/components/BrosAppNav.vue')
    const recents = read('src/app/components/BrosChatRecents.vue')
    const themeCss = read('src/layers/theme/app/assets/css/main.css')
    expect(themeCss).toContain('scrollbar-width: thin')
    expect(themeCss).toContain('::-webkit-scrollbar')
    expect(themeCss).toContain('::-webkit-scrollbar-thumb')
    expect(nav).toContain('bros-nav-panel__recents-wrap')
    expect(nav).toContain('bros-nav-panel__scroll')
    expect(nav).toContain('flex-shrink: 0')
    expect(nav).toContain('scrollbar-width: none')
    expect(nav).not.toContain('bros-nav-panel__recents-hint--up')
    expect(recents).toContain('scrollbar-width: none')
    expect(recents).toContain('::-webkit-scrollbar')
    expect(recents).toContain('i-lucide-chevron-up')
    expect(recents).toContain('i-lucide-chevron-down')
    expect(recents).toContain('overflow-y: auto')
    expect(recents.indexOf('bros-recents__toggle')).toBeLessThan(recents.indexOf('bros-nav-panel__recents-hint--up'))
    expect(recents.indexOf('bros-nav-panel__recents-hint--up')).toBeLessThan(recents.indexOf('bros-recents__list'))
    expect(recents.indexOf('bros-recents__list')).toBeLessThan(recents.indexOf('bros-nav-panel__recents-hint--down'))
    expect(read('src/layers/theme/app/app.config.ts')).toContain('showAfterPrimary: false')
    expect(read('src/app/app.config.ts')).toContain('showAfterPrimary: true')
  })

  it('truncates dock labels on one line instead of wrapping', () => {
    const tree = read('src/layers/theme/app/components/BrosNavTree.vue')
    const nav = read('src/layers/theme/app/components/BrosAppNav.vue')
    const recents = read('src/app/components/BrosChatRecents.vue')
    for (const src of [tree, nav, recents]) {
      expect(src).toContain('bros-nav-label')
      expect(src).toContain('white-space: nowrap')
      expect(src).toContain('text-overflow: ellipsis')
    }
  })

  it('has both apps extend docs then theme', () => {
    const app = read('src/app/nuxt.config.ts')
    const website = read('src/website/nuxt.config.ts')
    const docs = read('src/layers/docs/nuxt.config.ts')
    expect(app).toContain("'../layers/docs'")
    expect(app).toContain("'../layers/theme'")
    expect(website).toContain("'../layers/docs'")
    expect(website).toContain("'../layers/theme'")
    expect(docs).not.toContain('@bros/theme')
    expect(docs).toContain("'../theme'")
    expect(website).toContain('/docs/install')
    expect(website).toContain('/docs/providers/openai')
    expect(website).toContain('/docs/sidecars/ollama')
    expect(website).toContain('/docs/development')
  })
})
