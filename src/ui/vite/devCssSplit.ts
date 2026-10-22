import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'

export const DEV_CSS_MOD_PREFIX = '/_nuxt/bros-mod/'

export function hrefIncludesCss(href: string): boolean {
  return href.includes('.css')
}

/** Browser URL for a Vite CSS-as-JS import (path + `.js` so CF will not sniff text/css). */
export function toModuleCssUrl(url: string): string {
  if (!hrefIncludesCss(url) || url.includes('/bros-mod/')) return url
  const qIndex = url.indexOf('?')
  const path = qIndex >= 0 ? url.slice(0, qIndex) : url
  const query = qIndex >= 0 ? url.slice(qIndex) : ''
  if (!path.startsWith('/_nuxt/')) return url
  return `${DEV_CSS_MOD_PREFIX}${path.slice('/_nuxt/'.length)}.js${query}`
}

/** Map `/_nuxt/bros-mod/…css.js` back to the Vite `/_nuxt/…css` URL. */
export function fromModuleCssUrl(url: string): string | null {
  const [pathAndQuery] = url.split('#')
  if (!pathAndQuery.startsWith(DEV_CSS_MOD_PREFIX)) return null
  let rest = pathAndQuery.slice(DEV_CSS_MOD_PREFIX.length)
  const qIndex = rest.indexOf('?')
  let query = ''
  if (qIndex >= 0) {
    query = rest.slice(qIndex)
    rest = rest.slice(0, qIndex)
  }
  if (rest.endsWith('.js')) rest = rest.slice(0, -3)
  return `/_nuxt/${rest}${query}`
}

export function rewriteJsCssImports(code: string): string {
  return code.replace(
    /((?:import|from)\s*["'])(\/_nuxt\/[^"']+\.css[^"']*)(["'])/g,
    (full, open, url, close) => {
      if (url.includes('/bros-mod/')) return full
      return `${open}${toModuleCssUrl(url)}${close}`
    },
  )
}

const noStoreHeaders: Record<string, string> = {
  'Cache-Control': 'no-store, no-transform',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
}

export function applyViteNoStoreHeaders(res: ServerResponse) {
  for (const [name, value] of Object.entries(noStoreHeaders)) {
    res.setHeader(name, value)
  }
}

const INSTALLED = Symbol.for('bros-dev-css-split')

function headerDest(req: IncomingMessage): string {
  const raw = req.headers['sec-fetch-dest']
  return String(Array.isArray(raw) ? raw[0] : raw || '').toLowerCase()
}

export function shouldRewriteJsBody(url: string, dest: string): boolean {
  if (dest === 'style' || dest === 'image' || dest === 'font' || dest === 'document') return false
  return dest === 'script'
    || dest === 'empty'
    || dest === ''
    || url.includes('.mjs')
    || url.includes('.js')
    || url.includes('@id/')
    || url.includes('@vite/')
    || url.includes('virtual:nuxt')
}

function wrapJsImportRewrite(res: ServerResponse) {
  const chunks: Buffer[] = []
  const origWrite = res.write.bind(res)
  const origEnd = res.end.bind(res)

  const take = (chunk: unknown) => {
    if (chunk == null || typeof chunk === 'function') return
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  }

  res.write = ((chunk: unknown) => {
    take(chunk)
    return true
  }) as ServerResponse['write']

  res.end = ((chunk?: unknown) => {
    take(chunk)
    let body = Buffer.concat(chunks)
    const type = String(res.getHeader('content-type') || '')
    if (!type || type.includes('javascript') || type.includes('ecmascript')) {
      const text = body.toString('utf8')
      const rewritten = rewriteJsCssImports(text)
      if (rewritten !== text) {
        body = Buffer.from(rewritten)
        res.setHeader('content-length', body.length)
      }
    }
    origWrite(body)
    return origEnd()
  }) as ServerResponse['end']
}

export function brosDevCssSplitMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    applyViteNoStoreHeaders(res)
    const url = req.url || ''
    const mapped = fromModuleCssUrl(url)
    if (mapped) {
      req.url = mapped
      req.headers.accept = '*/*'
    }
    const dest = headerDest(req)
    if (shouldRewriteJsBody(url, dest) || shouldRewriteJsBody(req.url || '', dest)) {
      wrapJsImportRewrite(res)
    }
    next()
  }
}

export function installBrosDevCssSplit(server: ViteDevServer) {
  const app = server.middlewares as { stack: { route: string, handle: ReturnType<typeof brosDevCssSplitMiddleware> }[] } & {
    [INSTALLED]?: boolean
  }
  if (app[INSTALLED]) return
  app[INSTALLED] = true
  app.stack.unshift({ route: '', handle: brosDevCssSplitMiddleware() })
}

/**
 * Dev-only: Cloudflare caches `/_nuxt` CSS paths (query ignored) and will
 * reuse a `<link>` `text/css` body for the Nuxt CSS module import. Serve those
 * imports from `/_nuxt/bros-mod/…*.js` instead.
 */
export function brosDevCssSplitPlugin(): Plugin {
  return {
    name: 'bros-dev-css-split',
    apply: 'serve',
    enforce: 'post',
    configureServer(server) {
      installBrosDevCssSplit(server)
    },
    transform(code) {
      if (!code.includes('/_nuxt/') || !code.includes('.css')) return null
      const next = rewriteJsCssImports(code)
      return next === code ? null : { code: next, map: null }
    },
  }
}
