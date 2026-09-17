import { describe, expect, it } from 'vitest'
import {
  DEV_CSS_MOD_PREFIX,
  fromModuleCssUrl,
  rewriteJsCssImports,
  shouldRewriteJsBody,
  toModuleCssUrl,
} from '../../src/app/vite/devCssSplit'

describe('dev CSS module URL split', () => {
  it('maps Vite CSS imports onto a .js path and back', () => {
    const src = '/_nuxt/@fs/app/src/layers/theme/app/assets/css/main.css?t=1789614507528'
    const mod = toModuleCssUrl(src)
    expect(mod).toBe(`${DEV_CSS_MOD_PREFIX}@fs/app/src/layers/theme/app/assets/css/main.css.js?t=1789614507528`)
    expect(mod.endsWith('.js?t=1789614507528') || mod.includes('.css.js?')).toBe(true)
    expect(fromModuleCssUrl(mod)).toBe(src)
    expect(toModuleCssUrl(mod)).toBe(mod)

    const vue = '/_nuxt/app.vue?vue&type=style&index=0&scoped=aaa&lang.css'
    expect(fromModuleCssUrl(toModuleCssUrl(vue))).toBe(vue)
    expect(toModuleCssUrl('/docs/plain.css')).toBe('/docs/plain.css')
  })

  it('rewrites JS import specifiers only', () => {
    const code = [
      'import "/_nuxt/@fs/app/src/layers/theme/app/assets/css/main.css?t=1";',
      'import "/_nuxt/@id/virtual:nuxt:.nuxt%2Fnuxt-fonts-global.css";',
      'const keep = "color: red; /* main.css */";',
    ].join('\n')
    const out = rewriteJsCssImports(code)
    expect(out).toContain(`${DEV_CSS_MOD_PREFIX}@fs/app/src/layers/theme/app/assets/css/main.css.js?t=1`)
    expect(out).toContain(`${DEV_CSS_MOD_PREFIX}@id/virtual:nuxt:.nuxt%2Fnuxt-fonts-global.css.js`)
    expect(out).toContain('const keep = "color: red; /* main.css */";')
    expect(rewriteJsCssImports(out)).toBe(out)
    expect(shouldRewriteJsBody('/_nuxt/@id/virtual:nuxt:.nuxt%2Fcss.mjs', '')).toBe(true)
    expect(shouldRewriteJsBody('/_nuxt/@fs/app/src/layers/theme/app/assets/css/main.css', 'style')).toBe(false)
  })
})
